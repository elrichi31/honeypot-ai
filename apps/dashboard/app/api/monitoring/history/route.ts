import { requireRole } from "@/lib/roles"
import { proxyGet } from "@/lib/api/proxy"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const range = new URL(request.url).searchParams.get("range") ?? "24h"
  return proxyGet(`/monitoring/history?range=${encodeURIComponent(range)}`)
}
