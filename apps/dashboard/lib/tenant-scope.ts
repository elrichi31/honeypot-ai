// Server-side helpers for the active tenant scope. The superadmin's selected
// tenant is persisted in a cookie so both the client (the switcher) and the
// server (enforcement in route handlers / server components) can read it.
//
// The cookie is only a REQUEST — resolveScopeClientId decides the effective
// scope: a superadmin may enter any tenant; everyone else is pinned to their
// own clientId regardless of the cookie. So the cookie can never widen access.
import { cookies } from "next/headers"
import { resolveScopeClientId } from "@/lib/roles-shared"
import type { AuthOk } from "@/lib/roles"

export const TENANT_COOKIE = "tenant_scope"

/** The tenant the caller asked to view (from the cookie), or null for "global". */
export async function getRequestedTenant(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(TENANT_COOKIE)?.value
  return value && value.trim() ? value : null
}

/**
 * The effective client scope for this request: combines the authenticated user
 * with the requested tenant cookie. `clientId` is what to pass to the backend
 * as the filter (null = all clients; only possible for superadmin).
 */
export async function effectiveScope(auth: AuthOk): Promise<{ clientId: string | null; denied: boolean }> {
  const requested = await getRequestedTenant()
  return resolveScopeClientId(auth, requested)
}
