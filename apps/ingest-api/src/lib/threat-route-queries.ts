import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { ProtocolAggRow, SshAggRow, WebAggRow } from './threat-types.js'

export type CommandAggRow = {
  src_ip: string
  command: string
}

export type CommandDetailRow = {
  command: string | null
  eventTs: Date
}

// Default lookback for the threats list.
export const THREATS_WINDOW_DAYS = 90

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

// Optional per-client scope: when set, restrict to these sensors. An empty array
// is the caller's signal for "client has no sensors" and must match nothing.
export type ThreatScope = { sensorIds: string[] } | undefined

function sensorScope(scope: ThreatScope, sensorCol: Prisma.Sql): Prisma.Sql | null {
  if (!scope) return null
  if (scope.sensorIds.length === 0) return Prisma.sql`false`
  return Prisma.sql`${sensorCol} IN (${Prisma.join(scope.sensorIds)})`
}

// Row returned by the threat_ip_summary view query.
export type ThreatSummaryRow = {
  src_ip: string
  // SSH
  ssh_sessions: bigint
  ssh_auth_attempts: bigint
  ssh_had_success: boolean
  ssh_first_seen: Date | null
  ssh_last_seen: Date | null
  // Web
  web_total_hits: bigint
  web_attack_types: string[]
  web_first_seen: Date | null
  web_last_seen: Date | null
  web_hits_24h: bigint
  // Protocol
  protocols_seen: string[]
  proto_total_hits: bigint
  proto_auth_attempts: bigint
  proto_command_events: bigint
  proto_connect_events: bigint
  proto_first_seen: Date | null
  proto_last_seen: Date | null
  proto_hits_24h: bigint
  // Derived
  first_seen: Date | null
  last_seen: Date | null
  burst_score: number
}

/**
 * Queries the threat_ip_summary view — a single SQL pass over all honeypot sources
 * with no per-source row limit. Replaces the old 4×LIMIT-500 fan-out that silently
 * dropped IPs present only in protocol_hits (e.g. MSSQL-only burst attackers).
 */
export async function queryThreatSummaryRows(
  prisma: PrismaClient,
  ipFilter?: string,
  scope?: ThreatScope,
  windowDays = THREATS_WINDOW_DAYS,
): Promise<ThreatSummaryRow[]> {
  // Short-circuit: a scope with zero sensors must match nothing.
  if (scope && scope.sensorIds.length === 0) return []

  const conds: Prisma.Sql[] = []
  if (ipFilter) conds.push(Prisma.sql`t.src_ip ILIKE ${`%${ipFilter}%`}`)
  conds.push(Prisma.sql`t.last_seen >= ${cutoff(windowDays)}`)

  // Sensor scope: the view aggregates across all sensors, so we push down an
  // EXISTS check against the base tables to keep per-sensor filtering accurate.
  if (scope) {
    const ids = Prisma.join(scope.sensorIds)
    conds.push(Prisma.sql`(
      EXISTS (SELECT 1 FROM sessions     s2 WHERE s2.src_ip = t.src_ip AND s2.sensor_id IN (${ids}))
      OR
      EXISTS (SELECT 1 FROM web_hits     wh WHERE wh.src_ip = t.src_ip AND wh.sensor_id IN (${ids}))
      OR
      EXISTS (SELECT 1 FROM protocol_hits ph WHERE ph.src_ip = t.src_ip AND ph.sensor_id IN (${ids}))
    )`)
  }

  const where = Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
  return prisma.$queryRaw<ThreatSummaryRow[]>`
    SELECT *
    FROM threat_ip_summary t
    ${where}
    ORDER BY (t.ssh_sessions + t.web_total_hits + t.proto_total_hits) DESC
  `
}

export async function queryThreatCommandRows(prisma: PrismaClient, ipFilter?: string, scope?: ThreatScope) {
  const ipClause = ipFilter ? Prisma.sql`AND e.src_ip ILIKE ${`%${ipFilter}%`}` : Prisma.empty
  const scopeCond = sensorScope(scope, Prisma.raw('s.sensor_id'))
  const scopeJoin = scopeCond ? Prisma.sql`JOIN sessions s ON s.id = e.session_id` : Prisma.empty
  const scopeClause = scopeCond ? Prisma.sql`AND ${scopeCond}` : Prisma.empty
  const where = Prisma.sql`WHERE e.event_type = 'command.input' AND e.command IS NOT NULL AND e.event_ts >= ${cutoff(THREATS_WINDOW_DAYS)} ${ipClause} ${scopeClause}`
  const limit = ipFilter ? Prisma.sql`LIMIT 2000` : Prisma.sql`LIMIT 10000`
  return prisma.$queryRaw<Array<CommandAggRow>>`
    SELECT DISTINCT e.src_ip, e.command
    FROM events e
    ${scopeJoin}
    ${where}
    ${limit}
  `
}

// Per-source queries used only by the single-IP detail endpoint (/threats/:ip).

export async function queryThreatSshRows(prisma: PrismaClient, ipFilter?: string, scope?: ThreatScope) {
  const conds: Prisma.Sql[] = []
  if (ipFilter) conds.push(Prisma.sql`s.src_ip ILIKE ${`%${ipFilter}%`}`)
  conds.push(Prisma.sql`s.started_at >= ${cutoff(THREATS_WINDOW_DAYS)}`)
  const scopeCond = sensorScope(scope, Prisma.raw('s.sensor_id'))
  if (scopeCond) conds.push(scopeCond)
  const where = Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
  return prisma.$queryRaw<Array<SshAggRow>>`
    SELECT
      s.src_ip,
      COUNT(DISTINCT s.id)                                                        AS sessions,
      COUNT(e.id) FILTER (WHERE e.event_type IN ('auth.success','auth.failed'))   AS auth_attempts,
      BOOL_OR(s.login_success)                                                    AS had_success,
      MIN(s.started_at)                                                           AS first_seen,
      MAX(COALESCE(s.ended_at, s.started_at))                                     AS last_seen
    FROM sessions s
    LEFT JOIN events e ON e.session_id = s.id
    ${where}
    GROUP BY s.src_ip
    ORDER BY COUNT(DISTINCT s.id) DESC
  `
}

export async function queryThreatWebRows(prisma: PrismaClient, ipFilter?: string, scope?: ThreatScope) {
  const conds: Prisma.Sql[] = []
  if (ipFilter) conds.push(Prisma.sql`src_ip ILIKE ${`%${ipFilter}%`}`)
  conds.push(Prisma.sql`timestamp >= ${cutoff(THREATS_WINDOW_DAYS)}`)
  const scopeCond = sensorScope(scope, Prisma.raw('sensor_id'))
  if (scopeCond) conds.push(scopeCond)
  const where = Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
  return prisma.$queryRaw<Array<WebAggRow>>`
    SELECT
      src_ip,
      COUNT(*)                              AS total_hits,
      ARRAY_AGG(DISTINCT attack_type)       AS attack_types,
      MIN(timestamp)                        AS first_seen,
      MAX(timestamp)                        AS last_seen
    FROM web_hits
    ${where}
    GROUP BY src_ip
    ORDER BY COUNT(*) DESC
  `
}

export async function queryThreatProtocolRows(prisma: PrismaClient, ipFilter?: string, scope?: ThreatScope) {
  const conds: Prisma.Sql[] = []
  if (ipFilter) conds.push(Prisma.sql`src_ip ILIKE ${`%${ipFilter}%`}`)
  conds.push(Prisma.sql`timestamp >= ${cutoff(THREATS_WINDOW_DAYS)}`)
  const scopeCond = sensorScope(scope, Prisma.raw('sensor_id'))
  if (scopeCond) conds.push(scopeCond)
  const where = Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
  return prisma.$queryRaw<Array<ProtocolAggRow>>`
    SELECT
      src_ip,
      protocol,
      COUNT(*)                                                                              AS total_hits,
      COUNT(*) FILTER (WHERE event_type = 'auth')                                          AS auth_attempts,
      COUNT(*) FILTER (WHERE event_type = 'command')                                       AS command_events,
      COUNT(*) FILTER (WHERE event_type = 'connect')                                       AS connect_events,
      ARRAY_AGG(DISTINCT dst_port)                                                         AS dst_ports,
      ARRAY_AGG(DISTINCT username) FILTER (WHERE username IS NOT NULL AND username <> '')  AS usernames,
      ARRAY_AGG(DISTINCT password) FILTER (WHERE password IS NOT NULL AND password <> '')  AS passwords,
      MIN(timestamp)                                                                        AS first_seen,
      MAX(timestamp)                                                                        AS last_seen
    FROM protocol_hits
    ${where}
    GROUP BY src_ip, protocol
    ORDER BY COUNT(*) DESC
  `
}

export async function queryThreatSshRow(prisma: PrismaClient, ip: string) {
  return prisma.$queryRaw<Array<SshAggRow>>`
    SELECT
      s.src_ip,
      COUNT(DISTINCT s.id)                                                        AS sessions,
      COUNT(e.id) FILTER (WHERE e.event_type IN ('auth.success','auth.failed'))   AS auth_attempts,
      BOOL_OR(s.login_success)                                                    AS had_success,
      MIN(s.started_at)                                                           AS first_seen,
      MAX(COALESCE(s.ended_at, s.started_at))                                     AS last_seen
    FROM sessions s
    LEFT JOIN events e ON e.session_id = s.id
    WHERE s.src_ip = ${ip}
    GROUP BY s.src_ip
  `
}

export async function queryThreatWebRow(prisma: PrismaClient, ip: string) {
  return prisma.$queryRaw<Array<WebAggRow>>`
    SELECT
      src_ip,
      COUNT(*)                              AS total_hits,
      ARRAY_AGG(DISTINCT attack_type)       AS attack_types,
      MIN(timestamp)                        AS first_seen,
      MAX(timestamp)                        AS last_seen
    FROM web_hits
    WHERE src_ip = ${ip}
    GROUP BY src_ip
  `
}

export async function queryThreatProtocolRowsByIp(prisma: PrismaClient, ip: string) {
  return prisma.$queryRaw<Array<ProtocolAggRow>>`
    SELECT
      src_ip,
      protocol,
      COUNT(*)                                                                              AS total_hits,
      COUNT(*) FILTER (WHERE event_type = 'auth')                                          AS auth_attempts,
      COUNT(*) FILTER (WHERE event_type = 'command')                                       AS command_events,
      COUNT(*) FILTER (WHERE event_type = 'connect')                                       AS connect_events,
      ARRAY_AGG(DISTINCT dst_port)                                                         AS dst_ports,
      ARRAY_AGG(DISTINCT username) FILTER (WHERE username IS NOT NULL AND username <> '')  AS usernames,
      ARRAY_AGG(DISTINCT password) FILTER (WHERE password IS NOT NULL AND password <> '')  AS passwords,
      MIN(timestamp)                                                                        AS first_seen,
      MAX(timestamp)                                                                        AS last_seen
    FROM protocol_hits
    WHERE src_ip = ${ip}
    GROUP BY src_ip, protocol
  `
}

export async function queryThreatCommandsByIp(prisma: PrismaClient, ip: string) {
  return prisma.event.findMany({
    where: { srcIp: ip, eventType: 'command.input', command: { not: null } },
    select: { command: true, eventTs: true },
    orderBy: { eventTs: 'asc' },
  })
}
