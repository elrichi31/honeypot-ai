import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { getApiUrl, ingestHeaders } from "@/lib/api/server"

const INTERNAL_API = getApiUrl()

export async function GET(request: NextRequest) {
  const authCheck = await requireRole("viewer")
  if (!authCheck.ok) return authCheck.response

  const res = await fetch(`${INTERNAL_API}/stats/credentials${request.nextUrl.search}`, {
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
