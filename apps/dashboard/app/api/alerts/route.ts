import { type NextRequest } from "next/server"
import { requireRole, resolveScopeClientId, type AuthOk } from "@/lib/roles"
import { proxyJson } from "@/lib/api/server"

export const dynamic = "force-dynamic"

// Build the backend querystring with the client filter forced to the user's
// effective scope. The requested ?clientId is only honored for superadmin
// (entering a tenant); everyone else is pinned to their own clientId.
function scopedQuery(request: NextRequest, auth: AuthOk, extra?: Record<string, string>): string {
  const requested = request.nextUrl.searchParams.get("clientId")
  const { clientId } = resolveScopeClientId(auth, requested)
  const sp = new URLSearchParams(request.nextUrl.searchParams)
  if (clientId) sp.set("clientId", clientId)
  else sp.delete("clientId")          // superadmin, all clients → no filter
  for (const [k, v] of Object.entries(extra ?? {})) sp.set(k, v)
  return sp.toString()
}

export async function GET(request: NextRequest) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const qs = scopedQuery(request, auth_check)
  const result = await proxyJson(`/alerts${qs ? `?${qs}` : ""}`)
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}

// Delete alerts within the caller's effective client scope. Requires analyst+
// so a plain viewer can't wipe alerts.
export async function DELETE(request: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const qs = scopedQuery(request, auth_check)
  const result = await proxyJson(`/alerts${qs ? `?${qs}` : ""}`, { method: "DELETE" })
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}
