import { Prisma } from '@prisma/client'

export const UTC_OFFSET_HOURS = -5

export function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export function toNumber(value: number | bigint | null | undefined): number {
  if (typeof value === 'bigint') return Number(value)
  return value ?? 0
}

export function toOffsetISOString(date: Date | null | undefined): string | null {
  if (!date) return null
  const offsetMs = UTC_OFFSET_HOURS * 60 * 60 * 1000
  const local = new Date(date.getTime() + offsetMs)
  const sign = UTC_OFFSET_HOURS >= 0 ? '+' : '-'
  const abs = Math.abs(UTC_OFFSET_HOURS).toString().padStart(2, '0')
  return local.toISOString().replace('Z', `${sign}${abs}:00`)
}

// Per-client / per-sensor scope for credential stats. `events` has no sensor_id,
// so we scope through the parent session: `session_id IN (SELECT id FROM sessions
// WHERE sensor_id IN (...))`. Both events(session_id) and sessions(sensor_id) are
// indexed, so this stays cheap. `undefined` = no scope (global); an empty array =
// match nothing (unknown client / client with no sensors), expressed as `false`.
export type EventScope = { sensorIds: string[] } | undefined

// SQL clause for the raw $queryRaw aggregations.
export function eventScopeClause(scope: EventScope): Prisma.Sql | null {
  if (!scope) return null
  if (scope.sensorIds.length === 0) return Prisma.sql`false`
  return Prisma.sql`session_id IN (SELECT id FROM sessions WHERE sensor_id IN (${Prisma.join(scope.sensorIds)}))`
}

// Equivalent fragment for Prisma ORM `where` objects (recent + count queries).
export function eventScopeWhere(scope: EventScope): Prisma.EventWhereInput | undefined {
  if (!scope) return undefined
  if (scope.sensorIds.length === 0) return { sessionId: { in: [] } }
  return { session: { is: { sensorId: { in: scope.sensorIds } } } }
}

export function buildAuthWhereSql(params?: { startDate?: Date; endDate?: Date; extra?: Prisma.Sql[]; scope?: EventScope }) {
  const clauses: Prisma.Sql[] = [Prisma.sql`event_type IN ('auth.success', 'auth.failed')`]
  if (params?.startDate) clauses.push(Prisma.sql`event_ts >= ${params.startDate}`)
  if (params?.endDate) clauses.push(Prisma.sql`event_ts <= ${params.endDate}`)
  const scopeClause = eventScopeClause(params?.scope)
  if (scopeClause) clauses.push(scopeClause)
  if (params?.extra?.length) clauses.push(...params.extra)
  return buildClauseBlock('WHERE', clauses)
}

export function buildClauseBlock(keyword: 'WHERE' | 'HAVING', clauses: Prisma.Sql[]) {
  const combined = clauses.slice(1).reduce(
    (sql, clause) => Prisma.sql`${sql} AND ${clause}`,
    clauses[0],
  )
  return keyword === 'WHERE'
    ? Prisma.sql`WHERE ${combined}`
    : Prisma.sql`HAVING ${combined}`
}
