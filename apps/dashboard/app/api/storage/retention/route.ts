import { requireRole } from "@/lib/roles"
import { proxyGet } from "@/lib/api/proxy"

export const dynamic = "force-dynamic"

export async function GET() {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  return proxyGet("/storage/retention")
}
