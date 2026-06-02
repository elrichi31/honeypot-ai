import { requireRole } from "@/lib/roles"
import { proxyGet } from "@/lib/api/proxy"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const range = new URL(req.url).searchParams.get("range") ?? "24h"
  return proxyGet(`/suricata/stats?range=${encodeURIComponent(range)}`)
}
