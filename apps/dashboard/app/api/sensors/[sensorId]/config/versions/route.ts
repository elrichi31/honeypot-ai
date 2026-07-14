import { NextRequest, NextResponse } from "next/server"
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
  const res = await fetch(controlApiUrl(`/sensors/${encodeURIComponent(sensorId)}/config/versions`), {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
