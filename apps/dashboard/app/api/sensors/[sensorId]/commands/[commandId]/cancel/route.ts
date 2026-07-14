import { NextRequest, NextResponse } from "next/server"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"
import { controlApiUrl, controlHeaders } from "@/lib/sensor-control"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sensorId: string; commandId: string }> },
) {
  const auth = await requireRole("analyst")
  if (!auth.ok) return auth.response

  const headers = controlHeaders(auth, req)
  if (!headers) return NextResponse.json({ error: "Control plane is not configured" }, { status: 503 })
  const { sensorId, commandId } = await params
  const res = await fetch(
    controlApiUrl(`/sensors/${encodeURIComponent(sensorId)}/commands/${encodeURIComponent(commandId)}/cancel`),
    { method: "POST", headers, signal: AbortSignal.timeout(10_000) },
  )
  const responseBody = await res.text()

  if (res.ok) {
    await logAudit({
      action: "UPDATE",
      resource: "SENSOR",
      resourceId: commandId,
      resourceName: sensorId,
      details: { action: "cancelled" },
      request: req,
    })
  }

  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
