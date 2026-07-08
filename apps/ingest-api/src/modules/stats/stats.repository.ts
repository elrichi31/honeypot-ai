import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { SensorScope } from '../../lib/sensor-scope.js'
import type {
  InsightWindowRow, FunnelRow, CountrySuccessCandidateRow,
  CredentialCampaignRow, RecurringIpRow, CommandPatternRow,
  DepthBucketRow, DepthStatsRow, SessionTimelineRow,
  CommandRow, CountRow, CountOnlyRow,
  CredentialPairRow, UsernameAggregateRow, PasswordAggregateRow,
  SprayPasswordRow, TargetedUsernameRow, DiversifiedAttackerRow,
} from './stats.types.js'
import {
  buildAuthWhereSql, buildClauseBlock, eventScopeClause, eventScopeWhere,
  protocolClause, type EventScope,
} from './stats.utils.js'

export type { EventScope }
export { buildAuthWhereSql, buildClauseBlock, eventScopeClause, eventScopeWhere, protocolClause }

// ---------------------------------------------------------------------------
// Misc / overview
// ---------------------------------------------------------------------------

export interface SshOverviewRow { sessions: bigint; uniqueIps: bigint; successfulLogins: bigint; lastSeen: Date | null }
export interface WebOverviewRow { hits: bigint; uniqueIps: bigint; lastSeen: Date | null }
export interface WebTopAttackRow { attackType: string }
export interface ProtocolOverviewRow { protocol: string; count: bigint; uniqueIps: bigint; authAttempts: bigint; lastSeen: Date | null }
export interface HeatmapRow { dow: number; hour: number; count: bigint }
export interface BaseBucket { bucketStart: string; label: string; count: number }
export interface ProtoBucket { protocol: string; bucketStart: string; label: string; count: number }

export class MiscRepository {
  constructor(private prismaRead: PrismaClient) {}

  async getHoneypotOverview(scope: SensorScope) {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    return Promise.all([
      this.prismaRead.$queryRaw<SshOverviewRow[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS sessions,
               COUNT(DISTINCT src_ip)::bigint AS "uniqueIps",
               COUNT(*) FILTER (WHERE login_success IS TRUE)::bigint AS "successfulLogins",
               MAX(started_at) AS "lastSeen"
        FROM sessions
        WHERE started_at >= ${cutoff} ${scope.cond('sensor_id')}
      `),
      this.prismaRead.$queryRaw<WebOverviewRow[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS hits,
               COUNT(DISTINCT src_ip)::bigint AS "uniqueIps",
               MAX(timestamp) AS "lastSeen"
        FROM web_hits
        WHERE timestamp >= ${cutoff} ${scope.cond('sensor_id')}
      `),
      this.prismaRead.$queryRaw<WebTopAttackRow[]>(Prisma.sql`
        SELECT attack_type AS "attackType"
        FROM web_hits
        WHERE timestamp >= ${cutoff} ${scope.cond('sensor_id')}
        GROUP BY attack_type
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `),
      this.prismaRead.$queryRaw<ProtocolOverviewRow[]>(Prisma.sql`
        SELECT protocol,
               COUNT(*)::bigint AS count,
               COUNT(DISTINCT src_ip)::bigint AS "uniqueIps",
               COUNT(*) FILTER (WHERE event_type = 'auth')::bigint AS "authAttempts",
               MAX(timestamp) AS "lastSeen"
        FROM protocol_hits
        WHERE timestamp >= ${cutoff} ${scope.cond('sensor_id')}
        GROUP BY protocol
        ORDER BY COUNT(*) DESC
      `),
    ])
  }

  async getCrossSensorTimeline(scope: SensorScope, truncUnit: string, interval: string, fmt: string, lbl: string, startDate: Date, endDate: Date): Promise<[BaseBucket[], BaseBucket[], ProtoBucket[]]> {
    return Promise.all([
      this.prismaRead.$queryRaw<BaseBucket[]>(Prisma.sql`
        WITH bounds AS (
          SELECT date_trunc(${truncUnit}, timezone('UTC', ${startDate}::timestamptz)) AS s,
                 date_trunc(${truncUnit}, timezone('UTC', ${endDate}::timestamptz))   AS e
        ),
        series AS (SELECT generate_series(s, e, ${Prisma.raw(interval)}) AS b FROM bounds),
        counts AS (
          SELECT date_trunc(${truncUnit}, timezone('UTC', started_at::timestamptz)) AS b, COUNT(*)::int AS count
          FROM sessions WHERE started_at >= ${startDate} AND started_at <= ${endDate} ${scope.cond('sensor_id')} GROUP BY 1
        )
        SELECT to_char(series.b, ${fmt}) AS "bucketStart", to_char(series.b, ${lbl}) AS label,
               COALESCE(counts.count, 0)::int AS count
        FROM series LEFT JOIN counts USING (b) ORDER BY series.b
      `),
      this.prismaRead.$queryRaw<BaseBucket[]>(Prisma.sql`
        WITH bounds AS (
          SELECT date_trunc(${truncUnit}, timezone('UTC', ${startDate}::timestamptz)) AS s,
                 date_trunc(${truncUnit}, timezone('UTC', ${endDate}::timestamptz))   AS e
        ),
        series AS (SELECT generate_series(s, e, ${Prisma.raw(interval)}) AS b FROM bounds),
        counts AS (
          SELECT date_trunc(${truncUnit}, timezone('UTC', timestamp::timestamptz)) AS b, COUNT(*)::int AS count
          FROM web_hits WHERE timestamp >= ${startDate} AND timestamp <= ${endDate} ${scope.cond('sensor_id')} GROUP BY 1
        )
        SELECT to_char(series.b, ${fmt}) AS "bucketStart", to_char(series.b, ${lbl}) AS label,
               COALESCE(counts.count, 0)::int AS count
        FROM series LEFT JOIN counts USING (b) ORDER BY series.b
      `),
      this.prismaRead.$queryRaw<ProtoBucket[]>(Prisma.sql`
        SELECT protocol,
               to_char(date_trunc(${truncUnit}, timezone('UTC', timestamp::timestamptz)), ${fmt}) AS "bucketStart",
               to_char(date_trunc(${truncUnit}, timezone('UTC', timestamp::timestamptz)), ${lbl}) AS label,
               COUNT(*)::int AS count
        FROM protocol_hits WHERE timestamp >= ${startDate} AND timestamp <= ${endDate} ${scope.cond('sensor_id')}
        GROUP BY 1, 2, 3 ORDER BY 3
      `),
    ])
  }

  getGeo(scope: SensorScope) {
    // src_ip can originate from SSH sessions, web hits, or any protocol honeypot.
    // protocol_hits stores the sensor id either in the column or in data->>'sensor'.
    return this.prismaRead.$queryRaw<{ srcIp: string; loginSuccess: boolean | null }[]>(Prisma.sql`
      WITH attackers AS (
        SELECT src_ip, login_success
        FROM sessions
        WHERE started_at >= NOW() - INTERVAL '90 days' ${scope.cond('sensor_id')}
        UNION ALL
        SELECT src_ip, false AS login_success
        FROM web_hits
        WHERE timestamp >= NOW() - INTERVAL '90 days' ${scope.cond('sensor_id')}
        UNION ALL
        SELECT src_ip, false AS login_success
        FROM protocol_hits
        WHERE timestamp >= NOW() - INTERVAL '90 days' ${scope.cond("COALESCE(sensor_id, data->>'sensor')")}
      )
      SELECT src_ip AS "srcIp", BOOL_OR(login_success IS TRUE) AS "loginSuccess"
      FROM attackers
      GROUP BY src_ip
    `)
  }

  getSessionCommands(take: number) {
    return this.prismaRead.event.findMany({
      where: { eventType: 'command.input', command: { not: null } },
      select: { sessionId: true, command: true },
      take,
      orderBy: { eventTs: 'asc' },
    })
  }

  getHeatmap(timezone: string, days: number, scope: SensorScope) {
    return this.prismaRead.$queryRaw<HeatmapRow[]>(Prisma.sql`
      SELECT EXTRACT(DOW  FROM started_at AT TIME ZONE ${timezone})::int AS dow,
             EXTRACT(HOUR FROM started_at AT TIME ZONE ${timezone})::int AS hour,
             COUNT(*)::bigint AS count
      FROM sessions WHERE started_at >= NOW() - (${days} || ' days')::interval ${scope.cond('sensor_id')}
      GROUP BY dow, hour ORDER BY dow, hour
    `)
  }
}

// ---------------------------------------------------------------------------
// KPI trends
// ---------------------------------------------------------------------------

type SparkRow = { count: number }
type ProtoCountRow = { protocol: string; count: bigint }
type ProtoSparkRow = { protocol: string; count: number }
type WindowCountsRow = { curCount: bigint; prevCount: bigint }

// One pass over [prevStart, now] instead of two separate [prevStart, curStart)
// and [curStart, now] queries — a single COUNT(*) FILTER splits the two
// periods, since both scan the same rows either way (see DASHBOARD_FIRST_LOAD.md
// Fase 3.1).
function windowCountsSql(table: string, tsCol: string, prevStart: Date, curStart: Date, now: Date, scope: SensorScope) {
  return Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE ${Prisma.raw(tsCol)} >= ${curStart})::bigint AS "curCount",
      COUNT(*) FILTER (WHERE ${Prisma.raw(tsCol)} < ${curStart})::bigint AS "prevCount"
    FROM ${Prisma.raw(table)}
    WHERE ${Prisma.raw(tsCol)} >= ${prevStart} AND ${Prisma.raw(tsCol)} <= ${now} ${scope.cond('sensor_id')}
  `
}

function sparkSql(table: string, tsCol: string, start: Date, end: Date, scope: SensorScope) {
  return Prisma.sql`
    WITH bounds AS (
      SELECT date_trunc('hour', ${start}::timestamptz) AS s,
             date_trunc('hour', ${end}::timestamptz)   AS e
    ),
    series AS (SELECT generate_series(s, e, interval '1 hour') AS b FROM bounds),
    counts AS (
      SELECT date_trunc('hour', ${Prisma.raw(tsCol)}::timestamptz) AS b, COUNT(*)::int AS count
      FROM ${Prisma.raw(table)}
      WHERE ${Prisma.raw(tsCol)} >= ${start} AND ${Prisma.raw(tsCol)} <= ${end} ${scope.cond('sensor_id')}
      GROUP BY 1
    )
    SELECT COALESCE(counts.count, 0)::int AS count
    FROM series LEFT JOIN counts USING (b) ORDER BY series.b
  `
}

export class KpiRepository {
  constructor(private prismaRead: PrismaClient) {}

  private windowCounts(table: string, tsCol: string, prevStart: Date, curStart: Date, now: Date, scope: SensorScope) {
    return this.prismaRead.$queryRaw<WindowCountsRow[]>(windowCountsSql(table, tsCol, prevStart, curStart, now, scope))
  }

  // Fuses the old uniqueIpCount(current) + uniqueIpCount(previous) into one
  // scan over [prevStart, now] with a period-tagged DISTINCT count.
  private uniqueIpCounts(prevStart: Date, curStart: Date, now: Date, scope: SensorScope) {
    return this.prismaRead.$queryRaw<WindowCountsRow[]>(Prisma.sql`
      WITH ips AS (
        SELECT src_ip, (started_at >= ${curStart}) AS is_current FROM sessions
          WHERE started_at >= ${prevStart} AND started_at <= ${now} ${scope.cond('sensor_id')}
        UNION ALL
        SELECT src_ip, (timestamp >= ${curStart}) AS is_current FROM web_hits
          WHERE timestamp >= ${prevStart} AND timestamp <= ${now} ${scope.cond('sensor_id')}
        UNION ALL
        SELECT src_ip, (timestamp >= ${curStart}) AS is_current FROM protocol_hits
          WHERE timestamp >= ${prevStart} AND timestamp <= ${now} ${scope.cond('sensor_id')}
      )
      SELECT
        COUNT(DISTINCT src_ip) FILTER (WHERE is_current)::bigint AS "curCount",
        COUNT(DISTINCT src_ip) FILTER (WHERE NOT is_current)::bigint AS "prevCount"
      FROM ips
    `)
  }

  private uniqueIpSpark(start: Date, end: Date, scope: SensorScope) {
    return this.prismaRead.$queryRaw<SparkRow[]>(Prisma.sql`
      WITH bounds AS (
        SELECT date_trunc('hour', ${start}::timestamptz) AS s,
               date_trunc('hour', ${end}::timestamptz)   AS e
      ),
      series AS (SELECT generate_series(s, e, interval '1 hour') AS b FROM bounds),
      rows AS (
        SELECT date_trunc('hour', started_at::timestamptz) AS b, src_ip FROM sessions
          WHERE started_at >= ${start} AND started_at <= ${end} ${scope.cond('sensor_id')}
        UNION ALL
        SELECT date_trunc('hour', timestamp::timestamptz) AS b, src_ip FROM web_hits
          WHERE timestamp >= ${start} AND timestamp <= ${end} ${scope.cond('sensor_id')}
        UNION ALL
        SELECT date_trunc('hour', timestamp::timestamptz) AS b, src_ip FROM protocol_hits
          WHERE timestamp >= ${start} AND timestamp <= ${end} ${scope.cond('sensor_id')}
      ),
      counts AS (SELECT b, COUNT(DISTINCT src_ip)::int AS count FROM rows GROUP BY b)
      SELECT COALESCE(counts.count, 0)::int AS count
      FROM series LEFT JOIN counts USING (b) ORDER BY series.b
    `)
  }

  // Fuses the old protocol-breakdown current + previous queries into one
  // period-tagged GROUP BY over [prevStart, now].
  private protocolBreakdownCounts(prevStart: Date, curStart: Date, now: Date, scope: SensorScope) {
    return this.prismaRead.$queryRaw<Array<{ protocol: string; curCount: bigint; prevCount: bigint }>>(Prisma.sql`
      SELECT
        protocol,
        COUNT(*) FILTER (WHERE timestamp >= ${curStart})::bigint AS "curCount",
        COUNT(*) FILTER (WHERE timestamp < ${curStart})::bigint AS "prevCount"
      FROM protocol_hits
      WHERE timestamp >= ${prevStart} AND timestamp <= ${now} ${scope.cond('sensor_id')}
      GROUP BY protocol
    `)
  }

  async getKpiTrends(scope: SensorScope) {
    const now = new Date()
    const curStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const prevStart = new Date(now.getTime() - 48 * 60 * 60 * 1000)

    return Promise.all([
      this.windowCounts('sessions', 'started_at', prevStart, curStart, now, scope),
      this.prismaRead.$queryRaw<SparkRow[]>(sparkSql('sessions', 'started_at', curStart, now, scope)),
      this.windowCounts('web_hits', 'timestamp', prevStart, curStart, now, scope),
      this.prismaRead.$queryRaw<SparkRow[]>(sparkSql('web_hits', 'timestamp', curStart, now, scope)),
      this.windowCounts('protocol_hits', 'timestamp', prevStart, curStart, now, scope),
      this.prismaRead.$queryRaw<SparkRow[]>(sparkSql('protocol_hits', 'timestamp', curStart, now, scope)),
      this.uniqueIpCounts(prevStart, curStart, now, scope),
      this.uniqueIpSpark(curStart, now, scope),
      this.protocolBreakdownCounts(prevStart, curStart, now, scope),
      this.prismaRead.$queryRaw<ProtoSparkRow[]>(Prisma.sql`
        SELECT protocol, COALESCE(counts.count, 0)::int AS count
        FROM (
          SELECT DISTINCT protocol FROM protocol_hits
          WHERE timestamp >= ${prevStart} AND timestamp <= ${now} ${scope.cond('sensor_id')}
        ) protos
        CROSS JOIN (
          WITH bounds AS (
            SELECT date_trunc('hour', ${curStart}::timestamptz) AS s,
                   date_trunc('hour', ${now}::timestamptz)      AS e
          ),
          series AS (SELECT generate_series(s, e, interval '1 hour') AS b FROM bounds)
          SELECT b FROM series
        ) hrs
        LEFT JOIN (
          SELECT protocol, date_trunc('hour', timestamp::timestamptz) AS b, COUNT(*)::int AS count
          FROM protocol_hits WHERE timestamp >= ${curStart} AND timestamp <= ${now} ${scope.cond('sensor_id')}
          GROUP BY 1, 2
        ) counts USING (protocol, b)
        ORDER BY protos.protocol, hrs.b
      `),
    ])
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function eventsScopeSql(scope: SensorScope) {
  return scope.all
    ? Prisma.empty
    : Prisma.sql`AND session_id IN (SELECT id FROM sessions WHERE true ${scope.cond('sensor_id')})`
}

export class DashboardRepository {
  constructor(private prismaRead: PrismaClient) {}

  getWindow(scope: SensorScope) {
    return this.prismaRead.$queryRaw<InsightWindowRow[]>(Prisma.sql`
      SELECT MIN(started_at) AS "firstSeen", MAX(COALESCE(ended_at, started_at)) AS "lastSeen",
             COUNT(*)::int AS "totalSessions", COUNT(DISTINCT src_ip)::int AS "uniqueIps"
      FROM sessions WHERE true ${scope.cond('sensor_id')}
    `)
  }

  getFunnel(scope: SensorScope) {
    return this.prismaRead.$queryRaw<FunnelRow[]>(Prisma.sql`
      WITH event_flags AS (
        SELECT session_id,
          bool_or(event_type = 'session.connect') AS has_connect,
          bool_or(event_type IN ('auth.success', 'auth.failed')) AS has_auth,
          bool_or(event_type = 'auth.success') AS has_success,
          bool_or(event_type = 'command.input') AS has_command,
          bool_or(event_type = 'command.input' AND (
            (command ILIKE '%authorized_keys%' AND (command ILIKE '%chattr%' OR command ILIKE '%ssh-rsa%' OR command ILIKE '%ssh-ed25519%'))
            OR command ILIKE '%xmrig%' OR command ILIKE '%minerd%' OR command ILIKE '%pool.minexmr%'
            OR command ILIKE '%stratum+tcp%'
            OR ((command ILIKE '%wget http%' OR command ILIKE '%curl http%') AND (command ILIKE '%chmod +x%' OR command ILIKE '%/tmp/%'))
            OR command ILIKE '%crontab%'
          )) AS has_high_signal_compromise
        FROM events WHERE true ${eventsScopeSql(scope)} GROUP BY session_id
      )
      SELECT COUNT(*) FILTER (WHERE has_connect)::int AS connections,
             COUNT(*) FILTER (WHERE has_auth)::int AS "authAttempts",
             COUNT(*) FILTER (WHERE has_success)::int AS "loginSuccess",
             COUNT(*) FILTER (WHERE has_command)::int AS commands,
             COUNT(*) FILTER (WHERE has_high_signal_compromise)::int AS "highSignalCompromise"
      FROM event_flags
    `)
  }

  getCountrySuccessCandidates(scope: SensorScope) {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    return this.prismaRead.$queryRaw<CountrySuccessCandidateRow[]>(Prisma.sql`
      SELECT src_ip AS "srcIp", COUNT(*)::int AS sessions,
             COUNT(*) FILTER (WHERE login_success IS TRUE)::int AS successes
      FROM sessions WHERE started_at >= ${cutoff} ${scope.cond('sensor_id')} GROUP BY src_ip
    `)
  }

  getCredentialCampaigns(scope: SensorScope) {
    return this.prismaRead.$queryRaw<CredentialCampaignRow[]>(Prisma.sql`
      WITH auth_events AS (
        SELECT date_bin('6 hours', event_ts, TIMESTAMP '2001-01-01') AS bucket_start,
               username, password, src_ip, success
        FROM events WHERE event_type IN ('auth.success', 'auth.failed') AND (username IS NOT NULL OR password IS NOT NULL) ${eventsScopeSql(scope)}
      )
      SELECT bucket_start AS "bucketStart", username, password,
             COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
             COUNT(DISTINCT src_ip)::int AS "uniqueIps", ARRAY_AGG(DISTINCT src_ip ORDER BY src_ip) AS ips
      FROM auth_events GROUP BY bucket_start, username, password
      HAVING COUNT(DISTINCT src_ip) >= 3
      ORDER BY "uniqueIps" DESC, attempts DESC, bucket_start DESC LIMIT 20
    `)
  }

  getRecurringIps(scope: SensorScope) {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    return this.prismaRead.$queryRaw<RecurringIpRow[]>(Prisma.sql`
      WITH per_ip AS (
        SELECT src_ip, COUNT(*)::int AS total_sessions,
               COUNT(*) FILTER (WHERE login_success IS FALSE)::int AS failed_sessions,
               COUNT(*) FILTER (WHERE login_success IS TRUE)::int AS successful_sessions,
               COUNT(DISTINCT CONCAT(COALESCE(username, ''), ':', COALESCE(password, '')))::int AS credential_count,
               MIN(started_at) AS first_seen, MAX(started_at) AS last_seen,
               MIN(started_at) FILTER (WHERE login_success IS FALSE) AS first_failed_at,
               (ARRAY_AGG(client_version ORDER BY started_at ASC))[1] AS client_version
        FROM sessions WHERE started_at >= ${cutoff} ${scope.cond('sensor_id')} GROUP BY src_ip
        HAVING COUNT(*) >= 2 AND COUNT(*) FILTER (WHERE login_success IS FALSE) >= 1
      ),
      next_attempt AS (
        SELECT p.src_ip, MIN(s.started_at) AS next_attempt_at
        FROM per_ip p INNER JOIN sessions s ON s.src_ip = p.src_ip AND p.first_failed_at IS NOT NULL AND s.started_at > p.first_failed_at ${scope.cond('s.sensor_id')}
        GROUP BY p.src_ip
      )
      SELECT p.src_ip AS "srcIp", p.total_sessions AS "totalSessions", p.failed_sessions AS "failedSessions",
             p.successful_sessions AS "successfulSessions", p.credential_count AS "credentialCount",
             p.first_seen AS "firstSeen", p.last_seen AS "lastSeen",
             CASE WHEN p.first_failed_at IS NOT NULL AND n.next_attempt_at IS NOT NULL
               THEN FLOOR(EXTRACT(EPOCH FROM (n.next_attempt_at - p.first_failed_at)) / 60)::int
               ELSE NULL END AS "returnAfterMinutes",
             p.client_version AS "clientVersion"
      FROM per_ip p LEFT JOIN next_attempt n ON n.src_ip = p.src_ip
      ORDER BY "totalSessions" DESC, "credentialCount" DESC, "successfulSessions" DESC LIMIT 20
    `)
  }

  getCommandPatterns(scope: SensorScope) {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    return this.prismaRead.$queryRaw<CommandPatternRow[]>(Prisma.sql`
      WITH successful_sessions AS (SELECT id, src_ip FROM sessions WHERE login_success IS TRUE AND started_at >= ${cutoff} ${scope.cond('sensor_id')}),
      ranked_commands AS (
        SELECT s.id AS session_id, s.src_ip, e.command, ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY e.event_ts ASC) AS rn
        FROM successful_sessions s INNER JOIN events e ON e.session_id = s.id
        WHERE e.event_type = 'command.input' AND e.command IS NOT NULL
      ),
      per_session AS (
        SELECT session_id, MAX(src_ip) AS src_ip,
               array_remove(array_agg(command ORDER BY rn) FILTER (WHERE rn <= 4), NULL) AS commands
        FROM ranked_commands GROUP BY session_id
      )
      SELECT array_to_string(commands, ' -> ') AS sequence, COUNT(*)::int AS sessions, COUNT(DISTINCT src_ip)::int AS "uniqueIps"
      FROM per_session WHERE array_length(commands, 1) IS NOT NULL
      GROUP BY sequence ORDER BY sessions DESC, "uniqueIps" DESC, sequence ASC LIMIT 15
    `)
  }

  getDepthBuckets(scope: SensorScope) {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    return this.prismaRead.$queryRaw<DepthBucketRow[]>(Prisma.sql`
      WITH successful_command_counts AS (
        SELECT s.id, COUNT(*) FILTER (WHERE e.event_type = 'command.input')::int AS command_count
        FROM sessions s LEFT JOIN events e ON e.session_id = s.id WHERE s.login_success IS TRUE AND s.started_at >= ${cutoff} ${scope.cond('s.sensor_id')} GROUP BY s.id
      )
      SELECT CASE WHEN command_count = 0 THEN '0' WHEN command_count BETWEEN 1 AND 3 THEN '1-3'
                  WHEN command_count BETWEEN 4 AND 10 THEN '4-10' WHEN command_count BETWEEN 11 AND 20 THEN '11-20'
                  ELSE '21+' END AS bucket,
             COUNT(*)::int AS sessions
      FROM successful_command_counts GROUP BY bucket
    `)
  }

  getDepthStats(scope: SensorScope) {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    return this.prismaRead.$queryRaw<DepthStatsRow[]>(Prisma.sql`
      WITH successful_command_counts AS (
        SELECT s.id, COUNT(*) FILTER (WHERE e.event_type = 'command.input')::int AS command_count
        FROM sessions s LEFT JOIN events e ON e.session_id = s.id WHERE s.login_success IS TRUE AND s.started_at >= ${cutoff} ${scope.cond('s.sensor_id')} GROUP BY s.id
      )
      SELECT ROUND(AVG(command_count)::numeric, 2)::float AS "averageCommands",
             MAX(command_count)::int AS "maxCommands",
             COUNT(*) FILTER (WHERE command_count >= 20)::int AS "interactiveSessions"
      FROM successful_command_counts
    `)
  }
}

// ---------------------------------------------------------------------------
// Novelty
// ---------------------------------------------------------------------------

export class NoveltyRepository {
  constructor(private prismaRead: PrismaClient) {}

  async getNoveltyStats(windowStart: Date, scope: SensorScope) {
    const baselineEnd = windowStart
    type CountRow = { count: bigint }
    type NewIpRow = { srcIp: string; hits: bigint }
    const protoCond = scope.cond("COALESCE(sensor_id, data->>'sensor')")

    return Promise.all([
      this.prismaRead.$queryRaw<CountRow[]>(Prisma.sql`
        WITH window_ips AS (
          SELECT DISTINCT src_ip FROM sessions      WHERE started_at >= ${windowStart} ${scope.cond('sensor_id')}
          UNION
          SELECT DISTINCT src_ip FROM web_hits      WHERE timestamp  >= ${windowStart} ${scope.cond('sensor_id')}
          UNION
          SELECT DISTINCT src_ip FROM protocol_hits WHERE timestamp  >= ${windowStart} ${protoCond}
        ),
        seen_before AS (
          SELECT DISTINCT src_ip FROM sessions      WHERE started_at < ${baselineEnd} ${scope.cond('sensor_id')}
          UNION
          SELECT DISTINCT src_ip FROM web_hits      WHERE timestamp  < ${baselineEnd} ${scope.cond('sensor_id')}
          UNION
          SELECT DISTINCT src_ip FROM protocol_hits WHERE timestamp  < ${baselineEnd} ${protoCond}
        )
        SELECT COUNT(*)::bigint AS count
        FROM window_ips
        WHERE src_ip NOT IN (SELECT src_ip FROM seen_before)
      `),
      this.prismaRead.$queryRaw<CountRow[]>(Prisma.sql`
        WITH window_creds AS (
          SELECT DISTINCT username, password
          FROM credential_attempts
          WHERE event_ts >= ${windowStart}
            AND username IS NOT NULL AND password IS NOT NULL ${scope.cond('sensor_id')}
        ),
        baseline_creds AS (
          SELECT DISTINCT username, password
          FROM credential_attempts
          WHERE event_ts < ${baselineEnd}
            AND username IS NOT NULL AND password IS NOT NULL ${scope.cond('sensor_id')}
        )
        SELECT COUNT(*)::bigint AS count
        FROM window_creds w
        WHERE NOT EXISTS (
          SELECT 1 FROM baseline_creds b
          WHERE b.username = w.username AND b.password = w.password
        )
      `),
      this.prismaRead.$queryRaw<CountRow[]>(Prisma.sql`
        WITH window_paths AS (
          SELECT DISTINCT path FROM web_hits WHERE timestamp >= ${windowStart} ${scope.cond('sensor_id')}
        ),
        baseline_paths AS (
          SELECT DISTINCT path FROM web_hits WHERE timestamp < ${baselineEnd} ${scope.cond('sensor_id')}
        )
        SELECT COUNT(*)::bigint AS count
        FROM window_paths
        WHERE path NOT IN (SELECT path FROM baseline_paths)
      `),
      this.prismaRead.$queryRaw<CountRow[]>(Prisma.sql`
        WITH window_cmds AS (
          SELECT DISTINCT command FROM events
          WHERE event_type = 'command.input' AND event_ts >= ${windowStart} AND command IS NOT NULL ${eventsScopeSql(scope)}
        ),
        baseline_cmds AS (
          SELECT DISTINCT command FROM events
          WHERE event_type = 'command.input' AND event_ts < ${baselineEnd} AND command IS NOT NULL ${eventsScopeSql(scope)}
        )
        SELECT COUNT(*)::bigint AS count
        FROM window_cmds
        WHERE command NOT IN (SELECT command FROM baseline_cmds)
      `),
      this.prismaRead.$queryRaw<NewIpRow[]>(Prisma.sql`
        WITH window_ips AS (
          SELECT src_ip, COUNT(*) AS hits FROM (
            SELECT src_ip FROM sessions      WHERE started_at >= ${windowStart} ${scope.cond('sensor_id')}
            UNION ALL
            SELECT src_ip FROM web_hits      WHERE timestamp  >= ${windowStart} ${scope.cond('sensor_id')}
            UNION ALL
            SELECT src_ip FROM protocol_hits WHERE timestamp  >= ${windowStart} ${protoCond}
          ) u GROUP BY src_ip
        ),
        seen_before AS (
          SELECT DISTINCT src_ip FROM sessions      WHERE started_at < ${baselineEnd} ${scope.cond('sensor_id')}
          UNION
          SELECT DISTINCT src_ip FROM web_hits      WHERE timestamp  < ${baselineEnd} ${scope.cond('sensor_id')}
          UNION
          SELECT DISTINCT src_ip FROM protocol_hits WHERE timestamp  < ${baselineEnd} ${protoCond}
        )
        SELECT src_ip AS "srcIp", hits
        FROM window_ips
        WHERE src_ip NOT IN (SELECT src_ip FROM seen_before)
        ORDER BY hits DESC
        LIMIT 5
      `),
    ])
  }
}

// ---------------------------------------------------------------------------
// Timeline (overview)
// ---------------------------------------------------------------------------

export class TimelineRepository {
  constructor(private prismaRead: PrismaClient) {}

  async getSessionTimeline(timezone: string, startDate: Date, endDate: Date, bucket: 'hour' | 'day') {
    const interval = bucket === 'hour' ? "interval '1 hour'" : "interval '1 day'"
    const truncUnit = bucket === 'hour' ? 'hour' : 'day'
    const format = bucket === 'hour' ? 'YYYY-MM-DD HH24:MI' : 'YYYY-MM-DD'
    const label = bucket === 'hour' ? 'HH24:MI' : 'DD/MM'

    return this.prismaRead.$queryRaw<SessionTimelineRow[]>(Prisma.sql`
      WITH bounds AS (
        SELECT date_trunc(${truncUnit}, timezone(${timezone}, ${startDate}::timestamptz)) AS start_local,
               date_trunc(${truncUnit}, timezone(${timezone}, ${endDate}::timestamptz))   AS end_local
      ),
      series AS (SELECT generate_series(start_local, end_local, ${Prisma.raw(interval)}) AS bucket_local FROM bounds),
      counts AS (
        SELECT date_trunc(${truncUnit}, timezone(${timezone}, started_at::timestamptz)) AS bucket_local,
               COUNT(*)::int AS sessions,
               COUNT(*) FILTER (WHERE login_success IS TRUE)::int AS "successfulLogins"
        FROM sessions
        WHERE started_at::timestamptz >= ${startDate}::timestamptz AND started_at::timestamptz <= ${endDate}::timestamptz
        GROUP BY 1
      )
      SELECT to_char(series.bucket_local, ${format})          AS "bucketStart",
             to_char(series.bucket_local, ${label})           AS label,
             COALESCE(counts.sessions, 0)::int                AS sessions,
             COALESCE(counts."successfulLogins", 0)::int      AS "successfulLogins"
      FROM series LEFT JOIN counts USING (bucket_local)
      ORDER BY series.bucket_local ASC
    `)
  }

  async getOverviewStats(startDate: Date, endDate: Date) {
    return Promise.all([
      this.prismaRead.session.count({ where: { startedAt: { gte: startDate, lte: endDate } } }),
      this.prismaRead.event.count({ where: { eventTs: { gte: startDate, lte: endDate }, eventType: 'command.input', command: { not: null } } }),
      this.prismaRead.event.count({ where: { eventTs: { gte: startDate, lte: endDate }, eventType: 'auth.success' } }),
      this.prismaRead.event.count({ where: { eventTs: { gte: startDate, lte: endDate }, eventType: 'auth.failed' } }),
      this.prismaRead.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(DISTINCT src_ip)::int AS count FROM sessions
        WHERE started_at >= ${startDate} AND started_at <= ${endDate}
      `),
      this.prismaRead.$queryRaw<CommandRow[]>(Prisma.sql`
        SELECT NULLIF(split_part(btrim(command), ' ', 1), '') AS command, COUNT(*)::int AS count
        FROM events
        WHERE event_type = 'command.input' AND command IS NOT NULL
          AND event_ts >= ${startDate} AND event_ts <= ${endDate}
        GROUP BY 1 HAVING NULLIF(split_part(btrim(command), ' ', 1), '') IS NOT NULL
        ORDER BY count DESC, command ASC LIMIT 10
      `),
      this.prismaRead.event.groupBy({ by: ['username'], where: { eventTs: { gte: startDate, lte: endDate }, eventType: { in: ['auth.success', 'auth.failed'] }, username: { not: null } }, _count: { username: true }, orderBy: { _count: { username: 'desc' } }, take: 10 }),
      this.prismaRead.event.groupBy({ by: ['password'], where: { eventTs: { gte: startDate, lte: endDate }, eventType: { in: ['auth.success', 'auth.failed'] }, password: { not: null } }, _count: { password: true }, orderBy: { _count: { password: 'desc' } }, take: 10 }),
    ])
  }
}

// ---------------------------------------------------------------------------
// MITRE matrix
// ---------------------------------------------------------------------------

export class MitreRepository {
  constructor(private prismaRead: PrismaClient) {}

  getMitreData(scope: SensorScope, cutoff: Date) {
    const eventsScope = scope.all
      ? Prisma.empty
      : Prisma.sql`AND session_id IN (SELECT id FROM sessions WHERE true ${scope.cond('sensor_id')})`

    return Promise.all([
      this.prismaRead.$queryRaw<{ attackType: string; count: bigint }[]>(Prisma.sql`
        SELECT attack_type AS "attackType", COUNT(*)::bigint AS count
        FROM web_hits WHERE timestamp >= ${cutoff} ${scope.cond('sensor_id')}
        GROUP BY attack_type
      `),
      this.prismaRead.$queryRaw<{ protocol: string; eventType: string; count: bigint }[]>(Prisma.sql`
        SELECT protocol, event_type AS "eventType", COUNT(*)::bigint AS count
        FROM protocol_hits WHERE timestamp >= ${cutoff} ${scope.cond('sensor_id')}
        GROUP BY protocol, event_type
      `),
      this.prismaRead.$queryRaw<{ eventType: string; isTransfer: boolean; count: bigint }[]>(Prisma.sql`
        SELECT event_type AS "eventType",
               (command ~* '\\m(wget|curl|tftp|scp)\\M') AS "isTransfer",
               COUNT(*)::bigint AS count
        FROM events WHERE event_ts >= ${cutoff} ${eventsScope}
        GROUP BY event_type, "isTransfer"
      `),
      this.prismaRead.$queryRaw<{ category: string; count: bigint }[]>(Prisma.sql`
        SELECT category, COUNT(*)::bigint AS count
        FROM suricata_alerts WHERE timestamp >= ${cutoff} ${scope.cond('sensor_id')}
        GROUP BY category
      `),
    ])
  }
}

// ---------------------------------------------------------------------------
// Bot ratio
// ---------------------------------------------------------------------------

export class BotRatioRepository {
  constructor(private prismaRead: PrismaClient) {}

  getBotRatio(scope: SensorScope) {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    type Row = { bot: bigint; human: bigint; unknown: bigint; total: bigint }
    return this.prismaRead.$queryRaw<Row[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE session_type = 'bot')     ::bigint AS bot,
        COUNT(*) FILTER (WHERE session_type = 'human')   ::bigint AS human,
        COUNT(*) FILTER (WHERE session_type = 'unknown' OR session_type IS NULL)::bigint AS unknown,
        COUNT(*)                                          ::bigint AS total
      FROM sessions
      WHERE started_at >= ${cutoff} ${scope.cond('sensor_id')}
    `)
  }
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export class CredentialsRepository {
  constructor(private prismaRead: PrismaClient) {}

  async countAttempts(type: 'all' | 'success' | 'failed', where: Prisma.Sql): Promise<number> {
    const outcome = type === 'success'
      ? Prisma.sql` AND success IS TRUE`
      : type === 'failed'
        ? Prisma.sql` AND success IS DISTINCT FROM TRUE`
        : Prisma.empty
    const rows = await this.prismaRead.$queryRaw<CountOnlyRow[]>(
      Prisma.sql`SELECT COUNT(*)::int AS count FROM credential_attempts ${where}${outcome}`,
    )
    return typeof rows[0]?.count === 'bigint' ? Number(rows[0].count) : (rows[0]?.count ?? 0)
  }

  queryRaw<T>(sql: Prisma.Sql): Promise<T[]> {
    return this.prismaRead.$queryRaw<T[]>(sql)
  }
}
