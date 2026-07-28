// Tenant scoping for ClickHouse analytics queries — the ClickHouse-flavored
// equivalent of sensor-scope.ts (which builds Prisma.Sql fragments; that type
// doesn't apply to the ClickHouse client's own query params). Same contract,
// same `?sensorIds=` query param the dashboard already sends via
// effectiveSensorScope(), so a scoped tenant can never see another tenant's
// history through the analytics endpoints — this is mandatory on every
// ClickHouse query, not optional (see ANALYTICS_MODULE.md "Arquitectura común").
export interface ClickHouseScope {
  all: boolean
  sensorIds: string[]
  cacheSuffix: string
  /** SQL fragment to splice after the WHERE clause — references the
   *  `sensorIds` query param below. Empty string when global (no filter). */
  condition: string
  /** Spread into `query_params` alongside the query's own params. */
  params: Record<string, unknown>
}

export function parseClickHouseScope(query: Record<string, unknown>): ClickHouseScope {
  const raw = typeof query.sensorIds === 'string' ? query.sensorIds.trim() : ''

  if (!raw) {
    return { all: true, sensorIds: [], cacheSuffix: 'all', condition: '', params: {} }
  }

  if (raw === '__none__') {
    return { all: false, sensorIds: [], cacheSuffix: 'none', condition: 'AND false', params: {} }
  }

  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) {
    return { all: false, sensorIds: [], cacheSuffix: 'none', condition: 'AND false', params: {} }
  }

  const cacheSuffix = `s:${[...ids].sort().join(',')}`
  return {
    all: false,
    sensorIds: ids,
    cacheSuffix,
    condition: 'AND sensor_id IN {sensorIds:Array(String)}',
    params: { sensorIds: ids },
  }
}
