import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

const INTERNAL_API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

function ingestHeaders() {
  return {
    "Content-Type": "application/json",
    ...(process.env.INGEST_SHARED_SECRET
      ? { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET }
      : {}),
  }
}

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
