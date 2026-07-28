import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { getApiUrl } from "@/lib/api/client"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { sensorScopeParam } from "@/lib/api/stats"

export const dynamic = "force-dynamic"

// Proxy to ingest-api's GET /analytics/credentials/top-combos — same pattern
// as app/api/analytics/trends/route.ts.
export async function GET(req: NextRequest) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const range = req.nextUrl.searchParams.get("range") ?? "30d"
  const limit = req.nextUrl.searchParams.get("limit") ?? "20"
  const { sensorIds } = await effectiveSensorScope()

  const url = new URL(`${getApiUrl()}/analytics/credentials/top-combos`)
  url.searchParams.set("range", range)
  url.searchParams.set("limit", limit)

  const res = await fetch(`${url.toString()}${sensorScopeParam(sensorIds)}`, { cache: "no-store" })
  if (!res.ok) {
    return NextResponse.json(await res.json().catch(() => ({ error: "analytics_unavailable" })), { status: res.status })
  }
  return NextResponse.json(await res.json())
}
