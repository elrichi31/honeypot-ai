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
    const cut = cutoff(windowDays)

    // GLOBAL scope → the pre-aggregated materialized view. It aggregates per IP
    // across ALL sensors, which is exactly the cross-sensor correlation a global
    // admin wants. Fast (read stored rows).
    if (!scope) {
      const conds: Prisma.Sql[] = [Prisma.sql`t.last_seen >= ${cut}`]
      if (ipFilter) conds.push(Prisma.sql`t.src_ip ILIKE ${`%${ipFilter}%`}`)
      return this.prismaRead.$queryRaw<ThreatSummaryRow[]>`
        SELECT * FROM threat_ip_summary t
        WHERE ${Prisma.join(conds, ' AND ')}
        ORDER BY (t.ssh_sessions + t.web_total_hits + t.proto_total_hits) DESC
      `
    }

    // SCOPED → the materialized view can't be used: its per-IP counts are global,
    // so an IP that hit web here but SSH on ANOTHER tenant's sensor would show a
    // bogus cross-protocol correlation. Re-aggregate from the base tables filtered
    // to THIS tenant's sensors, so every number reflects only its own sensors.
    // Counts are windowed (>= cut), which also bounds the live scan.
    if (scope.sensorIds.length === 0) return []
    const ids = Prisma.join(scope.sensorIds)
    const ipClause = ipFilter ? Prisma.sql`WHERE src_ip ILIKE ${`%${ipFilter}%`}` : Prisma.empty
    return this.prismaRead.$queryRaw<ThreatSummaryRow[]>`
      WITH ssh_agg AS (
        SELECT s.src_ip,
          COUNT(DISTINCT s.id) AS ssh_sessions,
          COUNT(e.id) FILTER (WHERE e.event_type IN ('auth.success','auth.failed')) AS ssh_auth_attempts,
          BOOL_OR(s.login_success) AS ssh_had_success,
          MIN(s.started_at) AS ssh_first_seen,
          MAX(COALESCE(s.ended_at, s.started_at)) AS ssh_last_seen
        FROM sessions s LEFT JOIN events e ON e.session_id = s.id
        WHERE s.sensor_id IN (${ids}) AND s.started_at >= ${cut}
        GROUP BY s.src_ip
      ),
      web_agg AS (
        SELECT src_ip,
          COUNT(*) AS web_total_hits,
          ARRAY_AGG(DISTINCT attack_type) AS web_attack_types,
          MIN(timestamp) AS web_first_seen, MAX(timestamp) AS web_last_seen,
          COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours') AS web_hits_24h
        FROM web_hits WHERE sensor_id IN (${ids}) AND timestamp >= ${cut}
        GROUP BY src_ip
      ),
      proto_agg AS (
        SELECT src_ip,
          ARRAY_AGG(DISTINCT protocol) AS protocols_seen,
          SUM(total_hits) AS proto_total_hits, SUM(auth_attempts) AS proto_auth_attempts,
          SUM(command_events) AS proto_command_events, SUM(connect_events) AS proto_connect_events,
          MIN(first_seen) AS proto_first_seen, MAX(last_seen) AS proto_last_seen,
          SUM(hits_24h) AS proto_hits_24h
        FROM (
          SELECT src_ip, protocol,
            COUNT(*) AS total_hits,
            COUNT(*) FILTER (WHERE event_type='auth') AS auth_attempts,
            COUNT(*) FILTER (WHERE event_type='command') AS command_events,
            COUNT(*) FILTER (WHERE event_type='connect') AS connect_events,
            MIN(timestamp) AS first_seen, MAX(timestamp) AS last_seen,
            COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours') AS hits_24h
          FROM protocol_hits WHERE sensor_id IN (${ids}) AND timestamp >= ${cut}
          GROUP BY src_ip, protocol
        ) ph_by_proto
        GROUP BY src_ip
      ),
      portscan_agg AS (
        SELECT src_ip,
          COUNT(DISTINCT id) AS scan_events,
          ARRAY_AGG(DISTINCT port) AS scanned_ports,
          MIN(timestamp) AS ps_first_seen, MAX(timestamp) AS ps_last_seen,
          COUNT(DISTINCT id) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours') AS scan_events_24h
        FROM (
          SELECT id, src_ip, timestamp, UNNEST(dst_ports) AS port
          FROM deception_portscans WHERE sensor_id IN (${ids}) AND timestamp >= ${cut}
        ) ps_flat
        GROUP BY src_ip
      ),
      all_ips AS (
        SELECT src_ip FROM ssh_agg
        UNION SELECT src_ip FROM web_agg
        UNION SELECT src_ip FROM proto_agg
        UNION SELECT src_ip FROM portscan_agg
      ),
      summary AS (
        SELECT a.src_ip,
          COALESCE(s.ssh_sessions,0) AS ssh_sessions,
          COALESCE(s.ssh_auth_attempts,0) AS ssh_auth_attempts,
          COALESCE(s.ssh_had_success,false) AS ssh_had_success,
          s.ssh_first_seen, s.ssh_last_seen,
          COALESCE(w.web_total_hits,0) AS web_total_hits,
          COALESCE(w.web_attack_types,'{}') AS web_attack_types,
          w.web_first_seen, w.web_last_seen, COALESCE(w.web_hits_24h,0) AS web_hits_24h,
          COALESCE(p.protocols_seen,'{}') AS protocols_seen,
          COALESCE(p.proto_total_hits,0) AS proto_total_hits,
          COALESCE(p.proto_auth_attempts,0) AS proto_auth_attempts,
          COALESCE(p.proto_command_events,0) AS proto_command_events,
          COALESCE(p.proto_connect_events,0) AS proto_connect_events,
          p.proto_first_seen, p.proto_last_seen, COALESCE(p.proto_hits_24h,0) AS proto_hits_24h,
          COALESCE(ps.scan_events,0) AS scan_events,
          COALESCE(ps.scanned_ports,'{}') AS scanned_ports,
          ps.ps_first_seen, ps.ps_last_seen, COALESCE(ps.scan_events_24h,0) AS scan_events_24h,
          LEAST(s.ssh_first_seen, w.web_first_seen, p.proto_first_seen, ps.ps_first_seen) AS first_seen,
          GREATEST(s.ssh_last_seen, w.web_last_seen, p.proto_last_seen, ps.ps_last_seen) AS last_seen,
          CASE WHEN (COALESCE(w.web_total_hits,0)+COALESCE(p.proto_total_hits,0)+COALESCE(ps.scan_events,0))=0 THEN 0.0
            ELSE ROUND((COALESCE(w.web_hits_24h,0)+COALESCE(p.proto_hits_24h,0)+COALESCE(ps.scan_events_24h,0))::numeric
                     / (COALESCE(w.web_total_hits,0)+COALESCE(p.proto_total_hits,0)+COALESCE(ps.scan_events,0))::numeric, 4)
          END AS burst_score
        FROM all_ips a
        LEFT JOIN ssh_agg s ON s.src_ip = a.src_ip
        LEFT JOIN web_agg w ON w.src_ip = a.src_ip
        LEFT JOIN proto_agg p ON p.src_ip = a.src_ip
        LEFT JOIN portscan_agg ps ON ps.src_ip = a.src_ip
      )
      SELECT * FROM summary
      ${ipClause}
      ORDER BY (ssh_sessions + web_total_hits + proto_total_hits) DESC
    `
  }

  async queryCommandRows(ipFilter?: string, scope?: ThreatScope, windowDays = THREATS_WINDOW_DAYS): Promise<CommandAggRow[]> {
    const ipClause = ipFilter ? Prisma.sql`AND e.src_ip ILIKE ${`%${ipFilter}%`}` : Prisma.empty
    const scopeCond = sensorScope(scope, Prisma.raw('s.sensor_id'))
    const scopeJoin = scopeCond ? Prisma.sql`JOIN sessions s ON s.id = e.session_id` : Prisma.empty
    const scopeClause = scopeCond ? Prisma.sql`AND ${scopeCond}` : Prisma.empty
    const where = Prisma.sql`WHERE e.event_type = 'command.input' AND e.command IS NOT NULL AND e.event_ts >= ${cutoff(windowDays)} ${ipClause} ${scopeClause}`
    const limit = ipFilter ? Prisma.sql`LIMIT 2000` : Prisma.sql`LIMIT 10000`
    return this.prismaRead.$queryRaw<CommandAggRow[]>`
      SELECT DISTINCT e.src_ip, e.command
      FROM events e
      ${scopeJoin}
      ${where}
      ${limit}
    `
  }

  async querySshRow(ip: string, scope?: ThreatScope): Promise<SshAggRow[]> {
    const s = sensorScope(scope, Prisma.raw('s.sensor_id'))
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
      WHERE s.src_ip = ${ip} ${s ? Prisma.sql`AND ${s}` : Prisma.empty}
      GROUP BY s.src_ip
    `
  }

  async queryWebRow(ip: string, scope?: ThreatScope): Promise<WebAggRow[]> {
    const s = sensorScope(scope, Prisma.raw('sensor_id'))
    return this.prismaRead.$queryRaw<WebAggRow[]>`
      SELECT
        src_ip,
        COUNT(*)                                                       AS total_hits,
        ARRAY_AGG(DISTINCT attack_type)                                AS attack_types,
        (ARRAY_AGG(path ORDER BY timestamp DESC))[1:8]                 AS top_paths,
        ARRAY_AGG(DISTINCT user_agent) FILTER (WHERE user_agent <> '') AS user_agents,
        COUNT(*) FILTER (WHERE canary_triggered)::int                 AS canary_hits,
        MIN(timestamp)                                                 AS first_seen,
        MAX(timestamp)                                                 AS last_seen
      FROM web_hits
      WHERE src_ip = ${ip} ${s ? Prisma.sql`AND ${s}` : Prisma.empty}
      GROUP BY src_ip
    `
  }

  async queryProtocolRowsByIp(ip: string, scope?: ThreatScope): Promise<ProtocolAggRow[]> {
    const s = sensorScope(scope, Prisma.raw('sensor_id'))
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
      WHERE src_ip = ${ip} ${s ? Prisma.sql`AND ${s}` : Prisma.empty}
      GROUP BY src_ip, protocol
    `
  }

  async queryPortscanByIp(ip: string, scope?: ThreatScope): Promise<Array<{ scan_events: bigint; scanned_ports: number[] }>> {
    const s = sensorScope(scope, Prisma.raw('sensor_id'))
    return this.prismaRead.$queryRaw<Array<{ scan_events: bigint; scanned_ports: number[] }>>`
      SELECT COUNT(DISTINCT id) AS scan_events, ARRAY_AGG(DISTINCT port) AS scanned_ports
      FROM (SELECT id, UNNEST(dst_ports) AS port FROM deception_portscans WHERE src_ip = ${ip} ${s ? Prisma.sql`AND ${s}` : Prisma.empty}) flat
    `
  }

  /** Raw commands/inputs typed against non-SSH honeypots (ftp, mysql, smb, etc via port-honeypot). */
  async queryProtocolCommandsByIp(ip: string, scope?: ThreatScope): Promise<Array<{ protocol: string; command: string; timestamp: Date }>> {
    const s = sensorScope(scope, Prisma.raw('sensor_id'))
    return this.prismaRead.$queryRaw<Array<{ protocol: string; command: string; timestamp: Date }>>`
      SELECT protocol, data->>'command' AS command, timestamp
      FROM protocol_hits
      WHERE src_ip = ${ip} AND data ? 'command' AND data->>'command' <> '' ${s ? Prisma.sql`AND ${s}` : Prisma.empty}
      ORDER BY timestamp ASC
      LIMIT 200
    `
  }

  async queryCommandsByIp(ip: string, scope?: ThreatScope): Promise<CommandDetailRow[]> {
    return this.prismaRead.event.findMany({
      where: {
        srcIp: ip, eventType: 'command.input', command: { not: null },
        ...(scope ? { session: { sensorId: { in: scope.sensorIds } } } : {}),
      },
      select: { command: true, eventTs: true },
      orderBy: { eventTs: 'asc' },
    })
  }
}
