import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { ProtocolAggRow, SshAggRow, WebAggRow } from '../../lib/threat-types.js'

export type { ProtocolAggRow, SshAggRow, WebAggRow }

export type CommandAggRow = {
  src_ip: string
  command: string
}

export type CommandDetailRow = {
  command: string | null
  eventTs: Date
}

export const THREATS_WINDOW_DAYS = 90

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

export type ThreatScope = { sensorIds: string[] } | undefined

function sensorScope(scope: ThreatScope, sensorCol: Prisma.Sql): Prisma.Sql | null {
  if (!scope) return null
  if (scope.sensorIds.length === 0) return Prisma.sql`false`
  return Prisma.sql`${sensorCol} IN (${Prisma.join(scope.sensorIds)})`
}

export type ThreatSummaryRow = {
  src_ip: string
  ssh_sessions: bigint
  ssh_auth_attempts: bigint
  ssh_had_success: boolean
  ssh_first_seen: Date | null
  ssh_last_seen: Date | null
  web_total_hits: bigint
  web_attack_types: string[]
  web_first_seen: Date | null
  web_last_seen: Date | null
  web_hits_24h: bigint
  protocols_seen: string[]
  proto_total_hits: bigint
  proto_auth_attempts: bigint
  proto_command_events: bigint
  proto_connect_events: bigint
  proto_first_seen: Date | null
  proto_last_seen: Date | null
  proto_hits_24h: bigint
  scan_events: bigint
  scanned_ports: number[]
  ps_first_seen: Date | null
  ps_last_seen: Date | null
  scan_events_24h: bigint
  first_seen: Date | null
  last_seen: Date | null
  burst_score: number
}

export class ThreatRepository {
  constructor(private prismaRead: PrismaClient) {}

  async querySummaryRows(
    ipFilter?: string,
    scope?: ThreatScope,
    windowDays = THREATS_WINDOW_DAYS,
  ): Promise<ThreatSummaryRow[]> {
    if (scope && scope.sensorIds.length === 0) return []

    const conds: Prisma.Sql[] = []
    if (ipFilter) conds.push(Prisma.sql`t.src_ip ILIKE ${`%${ipFilter}%`}`)
    conds.push(Prisma.sql`t.last_seen >= ${cutoff(windowDays)}`)

    if (scope) {
      const ids = Prisma.join(scope.sensorIds)
      conds.push(Prisma.sql`(
        EXISTS (SELECT 1 FROM sessions          s2 WHERE s2.src_ip = t.src_ip AND s2.sensor_id IN (${ids}))
        OR
        EXISTS (SELECT 1 FROM web_hits          wh WHERE wh.src_ip = t.src_ip AND wh.sensor_id IN (${ids}))
        OR
        EXISTS (SELECT 1 FROM protocol_hits     ph WHERE ph.src_ip = t.src_ip AND ph.sensor_id IN (${ids}))
        OR
        EXISTS (SELECT 1 FROM deception_portscans dp WHERE dp.src_ip = t.src_ip AND dp.sensor_id IN (${ids}))
      )`)
    }

    const where = Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
    return this.prismaRead.$queryRaw<ThreatSummaryRow[]>`
      SELECT *
      FROM threat_ip_summary t
      ${where}
      ORDER BY (t.ssh_sessions + t.web_total_hits + t.proto_total_hits) DESC
    `
  }

  async queryCommandRows(ipFilter?: string, scope?: ThreatScope): Promise<CommandAggRow[]> {
    const ipClause = ipFilter ? Prisma.sql`AND e.src_ip ILIKE ${`%${ipFilter}%`}` : Prisma.empty
    const scopeCond = sensorScope(scope, Prisma.raw('s.sensor_id'))
    const scopeJoin = scopeCond ? Prisma.sql`JOIN sessions s ON s.id = e.session_id` : Prisma.empty
    const scopeClause = scopeCond ? Prisma.sql`AND ${scopeCond}` : Prisma.empty
    const where = Prisma.sql`WHERE e.event_type = 'command.input' AND e.command IS NOT NULL AND e.event_ts >= ${cutoff(THREATS_WINDOW_DAYS)} ${ipClause} ${scopeClause}`
    const limit = ipFilter ? Prisma.sql`LIMIT 2000` : Prisma.sql`LIMIT 10000`
    return this.prismaRead.$queryRaw<CommandAggRow[]>`
      SELECT DISTINCT e.src_ip, e.command
      FROM events e
      ${scopeJoin}
      ${where}
      ${limit}
    `
  }

  async querySshRow(ip: string): Promise<SshAggRow[]> {
    return this.prismaRead.$queryRaw<SshAggRow[]>`
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

  async queryWebRow(ip: string): Promise<WebAggRow[]> {
    return this.prismaRead.$queryRaw<WebAggRow[]>`
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

  async queryProtocolRowsByIp(ip: string): Promise<ProtocolAggRow[]> {
    return this.prismaRead.$queryRaw<ProtocolAggRow[]>`
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

  async queryPortscanByIp(ip: string): Promise<Array<{ scan_events: bigint; scanned_ports: number[] }>> {
    return this.prismaRead.$queryRaw<Array<{ scan_events: bigint; scanned_ports: number[] }>>`
      SELECT COUNT(DISTINCT id) AS scan_events, ARRAY_AGG(DISTINCT port) AS scanned_ports
      FROM (SELECT id, UNNEST(dst_ports) AS port FROM deception_portscans WHERE src_ip = ${ip}) flat
    `
  }

  async queryCommandsByIp(ip: string): Promise<CommandDetailRow[]> {
    return this.prismaRead.event.findMany({
      where: { srcIp: ip, eventType: 'command.input', command: { not: null } },
      select: { command: true, eventTs: true },
      orderBy: { eventTs: 'asc' },
    })
  }
}
