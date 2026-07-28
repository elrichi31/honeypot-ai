import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { controlApiUrl, controlHeaders } from "@/lib/sensor-control"

export const dynamic = "force-dynamic"

// ingest-api gates GET /analytics/comparison behind the control-plane token +
// superadmin/global actor headers (cross-tenant data), not the usual
// ?sensorIds= tenant scope — same auth as the sensor-control routes.
export async function GET(req: NextRequest) {
  const auth = await requireRole("superadmin")
  if (!auth.ok) return auth.response

  const headers = controlHeaders(auth, req)
  if (!headers) return NextResponse.json({ error: "Control plane is not configured" }, { status: 503 })

  const range = req.nextUrl.searchParams.get("range") ?? "30d"
  const res = await fetch(`${controlApiUrl("/analytics/comparison")}?range=${encodeURIComponent(range)}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
