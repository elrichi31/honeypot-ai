import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { getApiUrl } from "@/lib/api/client"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { sensorScopeParam } from "@/lib/api/stats"

export const dynamic = "force-dynamic"

// Proxy to ingest-api's GET /analytics/report-summary (ANALYTICS_MODULE Fase
// F) — same pattern as app/api/analytics/trends/route.ts. Powers the
// "Overview" strip on the /analytics landing page (Fase H2). The /reports
// integration does not go through this proxy: it runs server-side and calls
// ingest-api directly via lib/api/analytics.ts.
export async function GET(req: NextRequest) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const range = req.nextUrl.searchParams.get("range") ?? "30d"
  const credentialLimit = req.nextUrl.searchParams.get("credentialLimit") ?? "1"
  const { sensorIds } = await effectiveSensorScope()

  const url = new URL(`${getApiUrl()}/analytics/report-summary`)
  url.searchParams.set("range", range)
  url.searchParams.set("credentialLimit", credentialLimit)

  const res = await fetch(`${url.toString()}${sensorScopeParam(sensorIds)}`, { cache: "no-store" })
  if (!res.ok) {
    return NextResponse.json(await res.json().catch(() => ({ error: "analytics_unavailable" })), { status: res.status })
  }
  return NextResponse.json(await res.json())
}
