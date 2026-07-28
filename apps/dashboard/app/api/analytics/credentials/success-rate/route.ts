import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { getApiUrl } from "@/lib/api/client"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { sensorScopeParam } from "@/lib/api/stats"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const range = req.nextUrl.searchParams.get("range") ?? "30d"
  const { sensorIds } = await effectiveSensorScope()

  const url = new URL(`${getApiUrl()}/analytics/credentials/success-rate`)
  url.searchParams.set("range", range)

  const res = await fetch(`${url.toString()}${sensorScopeParam(sensorIds)}`, { cache: "no-store" })
  if (!res.ok) {
    return NextResponse.json(await res.json().catch(() => ({ error: "analytics_unavailable" })), { status: res.status })
  }
  return NextResponse.json(await res.json())
}
