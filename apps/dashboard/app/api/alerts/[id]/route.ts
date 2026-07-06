import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"
import { effectiveScope } from "@/lib/tenant-scope"
import { proxyJson, ingestHeaders } from "@/lib/api/server"

export const dynamic = "force-dynamic"

// Delete a single alert, but only within the caller's client scope. The scope
// clientId is passed to the backend, which deletes only if the alert's client
// matches — so a scoped user can't delete another tenant's alert by id.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { id } = await params
  const { clientId } = await effectiveScope(auth_check)
  // Scoped users (incl. fail-closed SCOPE_NONE) pass their clientId; superadmin
  // viewing global passes nothing (may delete any single alert).
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""
  const result = await proxyJson(`/alerts/${encodeURIComponent(id)}${qs}`, { method: "DELETE", headers: ingestHeaders(false) })
  if (!result.ok) return Response.json({ error: result.error, requestId: result.requestId }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}
