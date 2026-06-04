import { requireRole } from "@/lib/roles"
import { proxyJson } from "@/lib/api/server"

export const dynamic = "force-dynamic"

export async function POST() {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const result = await proxyJson(`/alerts/read-all`, { method: "POST" })
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}
