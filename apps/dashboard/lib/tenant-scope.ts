// Server-side helpers for the active tenant scope. The superadmin's selected
// tenant is persisted in a cookie so both the client (the switcher) and the
// server (enforcement in route handlers / server components) can read it.
//
// The cookie is only a REQUEST — resolveScopeClientId decides the effective
// scope: a superadmin may enter any tenant; everyone else is pinned to their
// own clientId regardless of the cookie. So the cookie can never widen access.
import { cookies } from "next/headers"
import { cache } from "react"
import { resolveScopeClientId, SCOPE_NONE } from "@/lib/roles-shared"
import { requireRole, type AuthOk } from "@/lib/roles"
import { db } from "@/lib/db"

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

export interface SensorScope {
  /** null = global (no filter, superadmin viewing all). */
  clientId: string | null
  /** Sensor ids to filter telemetry by. undefined = no filter (global). */
  sensorIds: string[] | undefined
}

/**
 * Resolves the active tenant scope into the sensor ids that telemetry must be
 * limited to, for the CURRENT request. Computed once per request (React cache).
 *
 *  - superadmin viewing "Global" → { clientId: null, sensorIds: undefined }  (no filter)
 *  - any scoped tenant           → { clientId, sensorIds: [...] }            (filter to these)
 *  - scoped tenant with NO sensors, or fail-closed user → sensorIds: []      (shows nothing)
 *
 * Pass `sensorIds` to the stats fetchers; undefined means "all".
 */
export const effectiveSensorScope = cache(async (): Promise<SensorScope> => {
  const auth = await requireRole("viewer")
  if (!auth.ok) return { clientId: SCOPE_NONE, sensorIds: [] }   // not authed → nothing

  const { clientId } = await effectiveScope(auth)
  if (clientId === null) return { clientId: null, sensorIds: undefined }   // global, no filter
  if (clientId === SCOPE_NONE) return { clientId: SCOPE_NONE, sensorIds: [] }

  // Resolve the tenant's sensors straight from the DB (the dashboard has db
  // access; avoids a round-trip to the ingest-api).
  try {
    const { rows } = await db.query<{ sensor_id: string }>(
      `SELECT sensor_id FROM sensors WHERE client_id = $1`,
      [clientId],
    )
    return { clientId, sensorIds: rows.map((r) => r.sensor_id) }
  } catch {
    // On error, fail closed (empty) rather than leaking global data.
    return { clientId, sensorIds: [] }
  }
})
