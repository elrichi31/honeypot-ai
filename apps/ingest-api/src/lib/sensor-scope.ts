import { Prisma } from '@prisma/client'

/**
 * Tenant scoping for stats endpoints. The dashboard passes ?sensorIds=a,b,c to
 * limit telemetry to one tenant's sensors. Absent = global (no filter).
 *
 *  - no param            → { all: true }                      (no WHERE filter)
 *  - sensorIds=__none__   → empty scope                        (matches nothing)
 *  - sensorIds=a,b        → filter to those sensor ids
 *
 * Use `cond(column)` to get an `AND <column> IN (...)` fragment (empty when
 * global), and `cacheSuffix` to keep cached results separate per scope.
 */
export interface SensorScope {
  all: boolean
  sensorIds: string[]
  cacheSuffix: string
  /** AND <col> IN (...) — or empty SQL when global. Empty scope → AND false. */
  cond: (column: string) => Prisma.Sql
}

export function parseSensorScope(query: Record<string, unknown>): SensorScope {
  const raw = typeof query.sensorIds === 'string' ? query.sensorIds.trim() : ''

  if (!raw) {
    return { all: true, sensorIds: [], cacheSuffix: 'all', cond: () => Prisma.empty }
  }

  if (raw === '__none__') {
    // Scoped tenant with no sensors / fail-closed → match nothing.
    return {
      all: false,
      sensorIds: [],
      cacheSuffix: 'none',
      cond: () => Prisma.sql`AND false`,
    }
  }

  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) {
    return { all: false, sensorIds: [], cacheSuffix: 'none', cond: () => Prisma.sql`AND false` }
  }

  // Stable cache key regardless of order.
  const cacheSuffix = `s:${[...ids].sort().join(',')}`
  return {
    all: false,
    sensorIds: ids,
    cacheSuffix,
    cond: (column: string) =>
      Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(ids)})`,
  }
}

/**
 * Combine a tenant ceiling (from the cookie) with an optional manual sensor
 * narrow (a clientSlug/sensorId filter the user picked). The tenant scope is the
 * HARD limit: the manual filter can only narrow WITHIN it, never widen it. Used
 * by pages that keep the manual ClientSensorFilter (sessions, threats, web).
 *
 *  - tenant.all (global / superadmin) → manual as-is (undefined = everything)
 *  - manual undefined                 → whole tenant (tenant.sensorIds; [] = nothing)
 *  - both present                     → intersection (may be [] = nothing)
 */
export function narrowToTenant(tenant: SensorScope, manual: string[] | undefined): string[] | undefined {
  if (tenant.all) return manual
  if (manual === undefined) return tenant.sensorIds
  const ceiling = new Set(tenant.sensorIds)
  return manual.filter((id) => ceiling.has(id))
}
