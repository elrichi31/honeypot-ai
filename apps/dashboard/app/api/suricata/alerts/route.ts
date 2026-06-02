import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"
import { proxyGet } from "@/lib/api/proxy"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  return proxyGet(`/suricata/alerts${new URL(request.url).search}`)
}
