import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { getApiUrl, ingestHeaders } from "@/lib/api/server"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { sensorScopeParam } from "@/lib/api/stats"

const INTERNAL_API = getApiUrl()

export async function GET(request: NextRequest) {
  const authCheck = await requireRole("viewer")
  if (!authCheck.ok) return authCheck.response

  // The tenant ceiling is derived server-side. Strip any client-supplied
  // sensorIds so a manipulated request can never widen its own scope.
  const params = new URLSearchParams(request.nextUrl.search)
  params.delete("sensorIds")
  const { sensorIds } = await effectiveSensorScope()

  const res = await fetch(`${INTERNAL_API}/stats/credentials?${params.toString()}${sensorScopeParam(sensorIds)}`, {
    headers: ingestHeaders(false),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
