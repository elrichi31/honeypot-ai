import { NextRequest, NextResponse } from "next/server"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"
import { controlApiUrl, controlHeaders } from "@/lib/sensor-control"

export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sensorId: string }> },
) {
  const auth = await requireRole("admin")
  if (!auth.ok) return auth.response

  const headers = controlHeaders(auth, req)
  if (!headers) return NextResponse.json({ error: "Control plane is not configured" }, { status: 503 })
  const { sensorId } = await params
  const res = await fetch(controlApiUrl(`/sensors/${encodeURIComponent(sensorId)}/config/rollback`), {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10_000),
  })
  const responseBody = await res.text()

  if (res.ok) {
    await logAudit({
      action: "UPDATE",
      resource: "SENSOR_CONFIG",
      resourceId: sensorId,
      resourceName: sensorId,
      details: { action: "rollback" },
      request: req,
    })
  }

  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
