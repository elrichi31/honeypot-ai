import { type NextRequest } from "next/server"
import { requireRole, type AuthOk } from "@/lib/roles"
import { effectiveScope } from "@/lib/tenant-scope"
import { proxyJson, ingestHeaders } from "@/lib/api/server"

export const dynamic = "force-dynamic"

// Build the backend querystring with the client filter set to the caller's
// effective scope. The scope comes from the tenant cookie (set by the global
// switcher), and effectiveScope pins non-superadmins to their own client.
async function scopedQuery(request: NextRequest, auth: AuthOk): Promise<string> {
  const { clientId } = await effectiveScope(auth)
  const sp = new URLSearchParams(request.nextUrl.searchParams)
  if (clientId) sp.set("clientId", clientId)
  else sp.delete("clientId")          // superadmin, all clients → no filter
  return sp.toString()
}

export async function GET(request: NextRequest) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const qs = await scopedQuery(request, auth_check)
  const result = await proxyJson(`/alerts${qs ? `?${qs}` : ""}`, { headers: ingestHeaders(false) })
  if (!result.ok) return Response.json({ error: result.error, requestId: result.requestId }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}

// Delete alerts within the caller's effective client scope. Requires analyst+
// so a plain viewer can't wipe alerts.
export async function DELETE(request: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const qs = await scopedQuery(request, auth_check)
  const result = await proxyJson(`/alerts${qs ? `?${qs}` : ""}`, { method: "DELETE", headers: ingestHeaders(false) })
  if (!result.ok) return Response.json({ error: result.error, requestId: result.requestId }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}
