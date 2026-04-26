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

export function buildAuthWhereSql(params?: { startDate?: Date; endDate?: Date; extra?: Prisma.Sql[] }) {
  const clauses: Prisma.Sql[] = [Prisma.sql`event_type IN ('auth.success', 'auth.failed')`]
  if (params?.startDate) clauses.push(Prisma.sql`event_ts >= ${params.startDate}`)
  if (params?.endDate) clauses.push(Prisma.sql`event_ts <= ${params.endDate}`)
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
