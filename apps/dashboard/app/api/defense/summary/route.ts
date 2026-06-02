import { requireRole } from "@/lib/roles"
import { proxyGet } from "@/lib/api/proxy"

export const dynamic = "force-dynamic"

export async function GET() {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  return proxyGet("/api-defense/summary")
}
