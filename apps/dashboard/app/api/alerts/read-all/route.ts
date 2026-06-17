import { requireRole } from "@/lib/roles"
import { effectiveScope } from "@/lib/tenant-scope"
import { proxyJson } from "@/lib/api/server"

export const dynamic = "force-dynamic"

export async function POST() {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  // Scope comes from the tenant cookie; effectiveScope pins non-superadmins.
  const { clientId } = await effectiveScope(auth_check)
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""
  const result = await proxyJson(`/alerts/read-all${qs}`, { method: "POST" })
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}
