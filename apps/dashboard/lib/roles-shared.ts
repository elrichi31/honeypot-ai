// Two axes: PRIVILEGE (the staff ladder viewer<analyst<admin<superadmin, used by
// hasPermission for route gating) and TENANT SCOPE (isGlobalRole).
//
// Staff roles (superadmin/admin/analyst/viewer) are GLOBAL: they see every
// tenant and may focus on one via the tenant switcher. `cliente` is the only
// tenant-scoped role: locked to its own clientId, read-only, fail-closed if it
// has no clientId. `cliente` shares `viewer`'s privilege rank (read-only) but is
// scoped — the two axes are independent (see resolveScopeClientId).
export type Role = "superadmin" | "admin" | "analyst" | "viewer" | "cliente"

// Staff ladder for privilege checks. `cliente` is intentionally NOT here; it maps
// to viewer's rank via roleRank().
export const ROLE_ORDER: Role[] = ["viewer", "analyst", "admin", "superadmin"]

// Every valid role, for input validation. Includes `cliente` (not in ROLE_ORDER).
export const ALL_ROLES: Role[] = ["superadmin", "admin", "analyst", "viewer", "cliente"]

/** Privilege rank. `cliente` reads like a viewer; everything else is the ladder. */
function roleRank(role: Role): number {
  return ROLE_ORDER.indexOf(role === "cliente" ? "viewer" : role)
}

export function hasPermission(userRole: Role, requiredRole: Role): boolean {
  return roleRank(userRole) >= roleRank(requiredRole)
}

/** A global role sees every tenant; `cliente` is the only tenant-scoped role. */
export function isGlobalRole(role: Role): boolean {
  return role !== "cliente"
}

import type { TranslationKey } from "@/lib/i18n/dictionaries"

export const ROLE_LABEL_KEYS: Record<Role, TranslationKey> = {
  superadmin: "users.role.superadmin.label",
  admin: "users.role.admin.label",
  analyst: "users.role.analyst.label",
  viewer: "users.role.viewer.label",
  cliente: "users.role.cliente.label",
}

export const ROLE_DESCRIPTION_KEYS: Record<Role, TranslationKey> = {
  superadmin: "users.role.superadmin.description",
  admin: "users.role.admin.description",
  analyst: "users.role.analyst.description",
  viewer: "users.role.viewer.description",
  cliente: "users.role.cliente.description",
}

export const ROLE_COLORS: Record<Role, string> = {
  superadmin: "bg-fuchsia-500/10 text-fuchsia-400",
  admin: "bg-rose-500/10 text-rose-400",
  analyst: "bg-cyan-500/10 text-cyan-400",
  viewer: "bg-slate-500/10 text-slate-400",
  cliente: "bg-emerald-500/10 text-emerald-400",
}

// ── Tenant scoping (pure, no auth deps so it stays unit-testable) ─────────────

// Sentinel for "this user is scoped but to no real client" → matches nothing,
// so a misconfigured non-superadmin user sees no data instead of all of it.
export const SCOPE_NONE = "__none__"

export interface UserScope {
  /** true = staff (sees every tenant); false = `cliente` (scoped to clientId). */
  isGlobal: boolean
  clientId: string | null
}

/**
 * Resolves the client scope a request must be confined to. The effective
 * clientId is derived from the authenticated user — never trusted from the
 * query string — which is what makes tenant isolation real.
 *
 *  - global staff: may pass `requested` to "enter" a tenant; omitting it → null (all clients).
 *  - scoped `cliente` (has clientId): always forced to THEIR clientId; a mismatched
 *    `requested` is ignored and flagged via `denied` (for auditing).
 *  - `cliente` without clientId: SCOPE_NONE → sees nothing (fail-closed).
 *
 * `clientId` is what to pass to the backend as the filter (null = no filter / all clients).
 */
export function resolveScopeClientId(
  user: UserScope,
  requested?: string | null,
): { clientId: string | null; denied: boolean } {
  if (user.isGlobal) {
    return { clientId: requested && requested.trim() ? requested : null, denied: false }
  }
  if (user.clientId) {
    const denied = !!requested && requested !== user.clientId
    return { clientId: user.clientId, denied }
  }
  return { clientId: SCOPE_NONE, denied: false }
}
