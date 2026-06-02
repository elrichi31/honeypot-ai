import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"
import { proxyGet } from "@/lib/api/proxy"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const qs = req.nextUrl.searchParams.toString()
  return proxyGet(`/stats/cross-sensor-timeline${qs ? `?${qs}` : ""}`)
}
