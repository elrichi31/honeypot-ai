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

// When ipFilter is provided the query returns only matching IPs (for search pushdown).
// Without filter the query returns the top 500 IPs by activity. The threats page
// ranks by risk score, which tracks activity (sessions/hits) closely, and the rows
// are already ordered by activity DESC — so the highest-risk IPs are always within
// the top 500. This keeps us from loading + risk-scoring tens of thousands of IPs in
// memory just to render one page.
const UNFILTERED_IP_LIMIT = 500

// Default lookback for the threats list. Scanning all-time grows unbounded; the
// retention window already caps most tables at ~90 days, so a 90-day cutoff barely
// changes results while letting the planner prune by the timestamp indexes.
export const THREATS_WINDOW_DAYS = 90

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

// Builds the WHERE (ip filter + time cutoff) and LIMIT. `tsCol` is the timestamp
// column for this table (started_at / timestamp); when null no time filter applies.
function buildIpFilter(
  ipFilter: string | undefined,
  col: Prisma.Sql = Prisma.raw('src_ip'),
  tsCol: Prisma.Sql | null = Prisma.raw('timestamp'),
  windowDays = THREATS_WINDOW_DAYS,
) {
  const conds: Prisma.Sql[] = []
  if (ipFilter) conds.push(Prisma.sql`${col} ILIKE ${`%${ipFilter}%`}`)
  if (tsCol) conds.push(Prisma.sql`${tsCol} >= ${cutoff(windowDays)}`)
  return {
    where: conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty,
    limit: ipFilter ? Prisma.sql`LIMIT 200` : Prisma.sql`LIMIT ${UNFILTERED_IP_LIMIT}`,
  }
}

export async function queryThreatSshRows(prisma: PrismaClient, ipFilter?: string) {
  const { where, limit } = buildIpFilter(ipFilter, Prisma.raw('s.src_ip'), Prisma.raw('s.started_at'))
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
    ${limit}
  `
}

export async function queryThreatCommandRows(prisma: PrismaClient, ipFilter?: string) {
  const ipClause = ipFilter ? Prisma.sql`AND e.src_ip ILIKE ${`%${ipFilter}%`}` : Prisma.empty
  const where = Prisma.sql`WHERE e.event_type = 'command.input' AND e.command IS NOT NULL AND e.event_ts >= ${cutoff(THREATS_WINDOW_DAYS)} ${ipClause}`
  const limit = ipFilter ? Prisma.sql`LIMIT 2000` : Prisma.sql`LIMIT 10000`
  return prisma.$queryRaw<Array<CommandAggRow>>`
    SELECT DISTINCT e.src_ip, e.command
    FROM events e
    ${where}
    ${limit}
  `
}

export async function queryThreatWebRows(prisma: PrismaClient, ipFilter?: string) {
  const { where, limit } = buildIpFilter(ipFilter)
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
    ${limit}
  `
}

export async function queryThreatProtocolRows(prisma: PrismaClient, ipFilter?: string) {
  const { where, limit } = buildIpFilter(ipFilter)
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
    ${limit}
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
