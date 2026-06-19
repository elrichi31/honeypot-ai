// superadmin sits above admin: it's the only role that sees data across ALL
// tenants. Every other role is scoped to the user's clientId (see roles.ts
// resolveScopeClientId). superadmin is global-access by explicit role, never by
// a NULL clientId — that keeps tenant isolation fail-closed.
export type Role = "superadmin" | "admin" | "analyst" | "viewer"

export const ROLE_ORDER: Role[] = ["viewer", "analyst", "admin", "superadmin"]

export function hasPermission(userRole: Role, requiredRole: Role): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(requiredRole)
}

import type { TranslationKey } from "@/lib/i18n/dictionaries"

export const ROLE_LABEL_KEYS: Record<Role, TranslationKey> = {
  superadmin: "users.role.superadmin.label",
  admin: "users.role.admin.label",
  analyst: "users.role.analyst.label",
  viewer: "users.role.viewer.label",
}

export const ROLE_DESCRIPTION_KEYS: Record<Role, TranslationKey> = {
  superadmin: "users.role.superadmin.description",
  admin: "users.role.admin.description",
  analyst: "users.role.analyst.description",
  viewer: "users.role.viewer.description",
}

export const ROLE_COLORS: Record<Role, string> = {
  superadmin: "bg-fuchsia-500/10 text-fuchsia-400",
  admin: "bg-rose-500/10 text-rose-400",
  analyst: "bg-cyan-500/10 text-cyan-400",
  viewer: "bg-slate-500/10 text-slate-400",
}

// ── Tenant scoping (pure, no auth deps so it stays unit-testable) ─────────────

// Sentinel for "this user is scoped but to no real client" → matches nothing,
// so a misconfigured non-superadmin user sees no data instead of all of it.
export const SCOPE_NONE = "__none__"

export interface UserScope {
  isSuperadmin: boolean
  clientId: string | null
}

/**
 * Resolves the client scope a request must be confined to. The effective
 * clientId is derived from the authenticated user — never trusted from the
 * query string — which is what makes tenant isolation real.
 *
 *  - superadmin: may pass `requested` to "enter" a tenant; omitting it → null (all clients).
 *  - scoped user (has clientId): always forced to THEIR clientId; a mismatched
 *    `requested` is ignored and flagged via `denied` (for auditing).
 *  - non-superadmin without clientId: SCOPE_NONE → sees nothing (fail-closed).
 *
 * `clientId` is what to pass to the backend as the filter (null = no filter / all clients).
 */
export function resolveScopeClientId(
  user: UserScope,
  requested?: string | null,
): { clientId: string | null; denied: boolean } {
  if (user.isSuperadmin) {
    return { clientId: requested && requested.trim() ? requested : null, denied: false }
  }
  if (user.clientId) {
    const denied = !!requested && requested !== user.clientId
    return { clientId: user.clientId, denied }
  }
  return { clientId: SCOPE_NONE, denied: false }
}
