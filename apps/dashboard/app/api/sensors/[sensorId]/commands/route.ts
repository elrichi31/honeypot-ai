import { NextRequest, NextResponse } from "next/server"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"
import { controlApiUrl, controlHeaders } from "@/lib/sensor-control"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sensorId: string }> },
) {
  const auth = await requireRole("viewer")
  if (!auth.ok) return auth.response

  const headers = controlHeaders(auth, req)
  if (!headers) return NextResponse.json({ error: "Control plane is not configured" }, { status: 503 })
  const { sensorId } = await params
  const res = await fetch(controlApiUrl(`/sensors/${encodeURIComponent(sensorId)}/commands`), {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sensorId: string }> },
) {
  const auth = await requireRole("analyst")
  if (!auth.ok) return auth.response

  const headers = controlHeaders(auth, req)
  if (!headers) return NextResponse.json({ error: "Control plane is not configured" }, { status: 503 })
  const { sensorId } = await params
  const body = await req.text()
  const res = await fetch(controlApiUrl(`/sensors/${encodeURIComponent(sensorId)}/commands`), {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Idempotency-Key": req.headers.get("idempotency-key") ?? crypto.randomUUID(),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  })
  const responseBody = await res.text()

  if (res.ok) {
    await logAudit({
      action: "CREATE",
      resource: "SENSOR",
      resourceId: sensorId,
      resourceName: sensorId,
      details: { action: "status.get" },
      request: req,
    })
  }

  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
