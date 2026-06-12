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

// Per-client / per-sensor scope for credential stats. The credential_attempts
// view exposes a normalized `sensor_id` column for both sources, so scoping is a
// direct `sensor_id IN (...)` (no session join needed). `undefined` = no scope
// (global); an empty array = match nothing (unknown client / no sensors).
export type EventScope = { sensorIds: string[] } | undefined

// Optional protocol filter (e.g. 'ssh' | 'mysql' | 'mssql' | 'vnc' | 'rdp' ...).
export type ProtocolFilter = string | undefined

// SQL clause for the raw $queryRaw aggregations.
export function eventScopeClause(scope: EventScope): Prisma.Sql | null {
  if (!scope) return null
  if (scope.sensorIds.length === 0) return Prisma.sql`false`
  return Prisma.sql`sensor_id IN (${Prisma.join(scope.sensorIds)})`
}

export function protocolClause(protocol: ProtocolFilter): Prisma.Sql | null {
  if (!protocol) return null
  return Prisma.sql`protocol = ${protocol}`
}

// Equivalent fragment for Prisma ORM `where` objects (recent query). The recent
// tab queries the view via $queryRaw too now, but we keep a permissive shape for
// any ORM callers.
export function eventScopeWhere(scope: EventScope): Prisma.Sql | null {
  return eventScopeClause(scope)
}

export function buildAuthWhereSql(params?: {
  startDate?: Date; endDate?: Date; extra?: Prisma.Sql[]; scope?: EventScope; protocol?: ProtocolFilter
}) {
  // The credential_attempts view is already restricted to auth attempts, so no
  // event_type clause is needed — start from an always-true base.
  const clauses: Prisma.Sql[] = [Prisma.sql`1 = 1`]
  if (params?.startDate) clauses.push(Prisma.sql`event_ts >= ${params.startDate}`)
  if (params?.endDate) clauses.push(Prisma.sql`event_ts <= ${params.endDate}`)
  const scopeClause = eventScopeClause(params?.scope)
  if (scopeClause) clauses.push(scopeClause)
  const protoClause = protocolClause(params?.protocol)
  if (protoClause) clauses.push(protoClause)
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
