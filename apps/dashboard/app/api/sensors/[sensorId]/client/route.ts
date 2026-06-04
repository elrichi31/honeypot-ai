import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"
import { getApiUrl, ingestHeaders } from "@/lib/api/server"

const INTERNAL_API = getApiUrl()
const UPSTREAM_TIMEOUT_MS = 10000

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ sensorId: string }> },
) {
  const { sensorId } = await params
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const body = await req.text()
  const res = await fetch(`${INTERNAL_API}/sensors/${encodeURIComponent(sensorId)}/client`, {
    method: "PUT",
    headers: ingestHeaders(),
    body,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
  const responseBody = await res.text()

  if (res.ok) {
    // Re-grouping a sensor changes both the sensors list and per-client views.
    revalidatePath("/sensors")
    revalidatePath("/clients")
    revalidatePath("/clients/[slug]", "page")
    try {
      const parsed = JSON.parse(body)
      const isAssign = parsed?.clientId !== null && parsed?.clientId !== undefined
      await logAudit({
        action: "UPDATE",
        resource: "SENSOR",
        resourceId: sensorId,
        resourceName: sensorId,
        details: isAssign
          ? { action: "assigned", clientId: parsed.clientId }
          : { action: "unassigned" },
        request: req,
      })
    } catch { /* non-critical */ }
  }

  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
