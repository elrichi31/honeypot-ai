import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { getApiUrl } from "@/lib/api/client"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { sensorScopeParam } from "@/lib/api/stats"

export const dynamic = "force-dynamic"

// Thin proxy to ingest-api's GET /analytics/trends (ANALYTICS_MODULE Fase A):
// resolves the caller's tenant scope server-side (same as every other
// /api/stats/* route) and forwards it as ?sensorIds=, so a scoped client can
// never widen their view by editing the query string themselves.
export async function GET(req: NextRequest) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const range = req.nextUrl.searchParams.get("range") ?? "30d"
  const protocol = req.nextUrl.searchParams.get("protocol")
  const { sensorIds } = await effectiveSensorScope()

  const url = new URL(`${getApiUrl()}/analytics/trends`)
  url.searchParams.set("range", range)
  if (protocol) url.searchParams.set("protocol", protocol)

  const res = await fetch(`${url.toString()}${sensorScopeParam(sensorIds)}`, { cache: "no-store" })

  // 503 (ClickHouse not configured/reachable) passes through as-is so the UI
  // can show "analytics unavailable" instead of an empty chart.
  if (!res.ok) {
    return NextResponse.json(await res.json().catch(() => ({ error: "analytics_unavailable" })), { status: res.status })
  }
  return NextResponse.json(await res.json())
}
