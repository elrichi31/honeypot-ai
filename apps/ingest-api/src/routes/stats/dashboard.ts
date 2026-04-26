import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type {
  InsightWindowRow, FunnelRow, CountrySuccessCandidateRow,
  CredentialCampaignRow, RecurringIpRow, CommandPatternRow,
  DepthBucketRow, DepthStatsRow,
} from './types.js'
import { toNumber, toOffsetISOString } from './utils.js'

export async function dashboardRoute(fastify: FastifyInstance) {
  fastify.get('/stats/dashboards', async () => {
    const [windowRows, funnelRows, countrySuccessCandidates, credentialCampaignRows,
      recurringIpRows, commandPatternRows, depthBucketRows, depthStatsRows] =
      await Promise.all([
        queryWindow(fastify),
        queryFunnel(fastify),
        queryCountrySuccessCandidates(fastify),
        queryCredentialCampaigns(fastify),
        queryRecurringIps(fastify),
        queryCommandPatterns(fastify),
        queryDepthBuckets(fastify),
        queryDepthStats(fastify),
      ])

    const window = windowRows[0] ?? { firstSeen: null, lastSeen: null, totalSessions: 0, uniqueIps: 0 }
    const funnel = funnelRows[0] ?? { connections: 0, authAttempts: 0, loginSuccess: 0, commands: 0, highSignalCompromise: 0 }
    const depthStats = depthStatsRows[0] ?? { averageCommands: 0, maxCommands: 0, interactiveSessions: 0 }

    return {
      window: { firstSeen: toOffsetISOString(window.firstSeen), lastSeen: toOffsetISOString(window.lastSeen), totalSessions: toNumber(window.totalSessions), uniqueIps: toNumber(window.uniqueIps) },
      funnel: { connections: toNumber(funnel.connections), authAttempts: toNumber(funnel.authAttempts), loginSuccess: toNumber(funnel.loginSuccess), commands: toNumber(funnel.commands), highSignalCompromise: toNumber(funnel.highSignalCompromise) },
      countrySuccessCandidates: countrySuccessCandidates.map(r => ({ srcIp: r.srcIp, sessions: toNumber(r.sessions), successes: toNumber(r.successes) })),
      credentialCampaigns: credentialCampaignRows.map(r => ({ bucketStart: toOffsetISOString(r.bucketStart), username: r.username, password: r.password, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), uniqueIps: toNumber(r.uniqueIps), ips: r.ips })),
      recurringIps: recurringIpRows.map(r => ({ srcIp: r.srcIp, totalSessions: toNumber(r.totalSessions), failedSessions: toNumber(r.failedSessions), successfulSessions: toNumber(r.successfulSessions), credentialCount: toNumber(r.credentialCount), firstSeen: toOffsetISOString(r.firstSeen), lastSeen: toOffsetISOString(r.lastSeen), returnAfterMinutes: r.returnAfterMinutes === null ? null : toNumber(r.returnAfterMinutes), clientVersion: r.clientVersion })),
      commandPatterns: commandPatternRows.map(r => ({ sequence: r.sequence, sessions: toNumber(r.sessions), uniqueIps: toNumber(r.uniqueIps) })),
      successfulDepth: { buckets: depthBucketRows.map(r => ({ bucket: r.bucket, sessions: toNumber(r.sessions) })), averageCommands: depthStats.averageCommands ?? 0, maxCommands: depthStats.maxCommands ?? 0, interactiveSessions: toNumber(depthStats.interactiveSessions) },
    }
  })
}

function queryWindow(fastify: FastifyInstance) {
  return fastify.prisma.$queryRaw<InsightWindowRow[]>(Prisma.sql`
    SELECT MIN(started_at) AS "firstSeen", MAX(COALESCE(ended_at, started_at)) AS "lastSeen",
           COUNT(*)::int AS "totalSessions", COUNT(DISTINCT src_ip)::int AS "uniqueIps"
    FROM sessions
  `)
}

function queryFunnel(fastify: FastifyInstance) {
  return fastify.prisma.$queryRaw<FunnelRow[]>(Prisma.sql`
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
      FROM events GROUP BY session_id
    )
    SELECT COUNT(*) FILTER (WHERE has_connect)::int AS connections,
           COUNT(*) FILTER (WHERE has_auth)::int AS "authAttempts",
           COUNT(*) FILTER (WHERE has_success)::int AS "loginSuccess",
           COUNT(*) FILTER (WHERE has_command)::int AS commands,
           COUNT(*) FILTER (WHERE has_high_signal_compromise)::int AS "highSignalCompromise"
    FROM event_flags
  `)
}

function queryCountrySuccessCandidates(fastify: FastifyInstance) {
  return fastify.prisma.$queryRaw<CountrySuccessCandidateRow[]>(Prisma.sql`
    SELECT src_ip AS "srcIp", COUNT(*)::int AS sessions,
           COUNT(*) FILTER (WHERE login_success IS TRUE)::int AS successes
    FROM sessions GROUP BY src_ip
  `)
}

function queryCredentialCampaigns(fastify: FastifyInstance) {
  return fastify.prisma.$queryRaw<CredentialCampaignRow[]>(Prisma.sql`
    WITH auth_events AS (
      SELECT date_bin('6 hours', event_ts, TIMESTAMP '2001-01-01') AS bucket_start,
             username, password, src_ip, success
      FROM events WHERE event_type IN ('auth.success', 'auth.failed') AND (username IS NOT NULL OR password IS NOT NULL)
    )
    SELECT bucket_start AS "bucketStart", username, password,
           COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
           COUNT(DISTINCT src_ip)::int AS "uniqueIps", ARRAY_AGG(DISTINCT src_ip ORDER BY src_ip) AS ips
    FROM auth_events GROUP BY bucket_start, username, password
    HAVING COUNT(DISTINCT src_ip) >= 3
    ORDER BY "uniqueIps" DESC, attempts DESC, bucket_start DESC LIMIT 20
  `)
}

function queryRecurringIps(fastify: FastifyInstance) {
  return fastify.prisma.$queryRaw<RecurringIpRow[]>(Prisma.sql`
    WITH per_ip AS (
      SELECT src_ip, COUNT(*)::int AS total_sessions,
             COUNT(*) FILTER (WHERE login_success IS FALSE)::int AS failed_sessions,
             COUNT(*) FILTER (WHERE login_success IS TRUE)::int AS successful_sessions,
             COUNT(DISTINCT CONCAT(COALESCE(username, ''), ':', COALESCE(password, '')))::int AS credential_count,
             MIN(started_at) AS first_seen, MAX(started_at) AS last_seen,
             MIN(started_at) FILTER (WHERE login_success IS FALSE) AS first_failed_at,
             (ARRAY_AGG(client_version ORDER BY started_at ASC))[1] AS client_version
      FROM sessions GROUP BY src_ip
      HAVING COUNT(*) >= 2 AND COUNT(*) FILTER (WHERE login_success IS FALSE) >= 1
    ),
    next_attempt AS (
      SELECT p.src_ip, MIN(s.started_at) AS next_attempt_at
      FROM per_ip p INNER JOIN sessions s ON s.src_ip = p.src_ip AND p.first_failed_at IS NOT NULL AND s.started_at > p.first_failed_at
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

function queryCommandPatterns(fastify: FastifyInstance) {
  return fastify.prisma.$queryRaw<CommandPatternRow[]>(Prisma.sql`
    WITH successful_sessions AS (SELECT id, src_ip FROM sessions WHERE login_success IS TRUE),
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

function queryDepthBuckets(fastify: FastifyInstance) {
  return fastify.prisma.$queryRaw<DepthBucketRow[]>(Prisma.sql`
    WITH successful_command_counts AS (
      SELECT s.id, COUNT(*) FILTER (WHERE e.event_type = 'command.input')::int AS command_count
      FROM sessions s LEFT JOIN events e ON e.session_id = s.id WHERE s.login_success IS TRUE GROUP BY s.id
    )
    SELECT CASE WHEN command_count = 0 THEN '0' WHEN command_count BETWEEN 1 AND 3 THEN '1-3'
                WHEN command_count BETWEEN 4 AND 10 THEN '4-10' WHEN command_count BETWEEN 11 AND 20 THEN '11-20'
                ELSE '21+' END AS bucket,
           COUNT(*)::int AS sessions
    FROM successful_command_counts GROUP BY bucket
  `)
}

function queryDepthStats(fastify: FastifyInstance) {
  return fastify.prisma.$queryRaw<DepthStatsRow[]>(Prisma.sql`
    WITH successful_command_counts AS (
      SELECT s.id, COUNT(*) FILTER (WHERE e.event_type = 'command.input')::int AS command_count
      FROM sessions s LEFT JOIN events e ON e.session_id = s.id WHERE s.login_success IS TRUE GROUP BY s.id
    )
    SELECT ROUND(AVG(command_count)::numeric, 2)::float AS "averageCommands",
           MAX(command_count)::int AS "maxCommands",
           COUNT(*) FILTER (WHERE command_count >= 20)::int AS "interactiveSessions"
    FROM successful_command_counts
  `)
}
