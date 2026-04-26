import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

type TimelineBucket = 'hour' | 'day';

interface TimelineRow {
  bucketStart: string;
  label: string;
  count: number;
}

interface SessionTimelineRow {
  bucketStart: string;
  label: string;
  sessions: number;
  successfulLogins: number;
}

interface CountRow {
  count: number | bigint;
}

interface CommandRow {
  command: string;
  count: number | bigint;
}

interface GroupedUsernameRow {
  username: string | null;
  _count: {
    username: number | bigint;
  };
}

interface GroupedPasswordRow {
  password: string | null;
  _count: {
    password: number | bigint;
  };
}

interface CountOnlyRow {
  count: number | bigint;
}

interface CredentialPairRow {
  username: string | null;
  password: string | null;
  attempts: number | bigint;
  successCount: number | bigint;
  failedCount: number | bigint;
  uniqueIps: number | bigint;
  firstSeen: Date;
  lastSeen: Date;
}

interface UsernameAggregateRow {
  username: string | null;
  attempts: number | bigint;
  successCount: number | bigint;
  failedCount: number | bigint;
  uniqueIps: number | bigint;
  passwordCount: number | bigint;
}

interface PasswordAggregateRow {
  password: string | null;
  attempts: number | bigint;
  successCount: number | bigint;
  failedCount: number | bigint;
  uniqueIps: number | bigint;
  usernameCount: number | bigint;
}

interface SprayPasswordRow {
  password: string | null;
  attempts: number | bigint;
  successCount: number | bigint;
  usernameCount: number | bigint;
  ipCount: number | bigint;
}

interface TargetedUsernameRow {
  username: string | null;
  attempts: number | bigint;
  successCount: number | bigint;
  passwordCount: number | bigint;
  ipCount: number | bigint;
}

interface DiversifiedAttackerRow {
  srcIp: string;
  attempts: number | bigint;
  successCount: number | bigint;
  credentialCount: number | bigint;
  usernameCount: number | bigint;
  passwordCount: number | bigint;
  lastSeen: Date;
}

interface InsightWindowRow {
  firstSeen: Date | null;
  lastSeen: Date | null;
  totalSessions: number | bigint;
  uniqueIps: number | bigint;
}

interface FunnelRow {
  connections: number | bigint;
  authAttempts: number | bigint;
  loginSuccess: number | bigint;
  commands: number | bigint;
  highSignalCompromise: number | bigint;
}

interface CountrySuccessCandidateRow {
  srcIp: string;
  sessions: number | bigint;
  successes: number | bigint;
}

interface CredentialCampaignRow {
  bucketStart: Date;
  username: string | null;
  password: string | null;
  attempts: number | bigint;
  successCount: number | bigint;
  uniqueIps: number | bigint;
  ips: string[];
}

interface RecurringIpRow {
  srcIp: string;
  totalSessions: number | bigint;
  failedSessions: number | bigint;
  successfulSessions: number | bigint;
  credentialCount: number | bigint;
  firstSeen: Date;
  lastSeen: Date;
  returnAfterMinutes: number | bigint | null;
  clientVersion: string | null;
}

interface CommandPatternRow {
  sequence: string;
  sessions: number | bigint;
  uniqueIps: number | bigint;
}

interface DepthBucketRow {
  bucket: string;
  sessions: number | bigint;
}

interface DepthStatsRow {
  averageCommands: number | null;
  maxCommands: number | null;
  interactiveSessions: number | bigint;
}

type CredentialsMainTab = 'rankings' | 'patterns' | 'recent';
type CredentialsRankingType = 'pairs' | 'passwords' | 'usernames';
type CredentialsOutcomeFilter = 'all' | 'success' | 'failed';
type CredentialsFrequencyFilter = 'all' | 'reused' | 'single';
type CredentialsSortDirection = 'asc' | 'desc';
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const credentialsQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  recentLimit: z.coerce.number().int().min(1).max(1000).default(20),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  mainTab: z.enum(['rankings', 'patterns', 'recent']).default('rankings'),
  rankingType: z.enum(['pairs', 'passwords', 'usernames']).default('pairs'),
  outcome: z.enum(['all', 'success', 'failed']).default('all'),
  frequency: z.enum(['all', 'reused', 'single']).default('reused'),
  search: z.string().trim().optional(),
  sortBy: z.string().trim().optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function toNumber(value: number | bigint | null | undefined): number {
  if (typeof value === 'bigint') return Number(value);
  return value ?? 0;
}

const UTC_OFFSET_HOURS = -5;

function toOffsetISOString(date: Date | null | undefined): string | null {
  if (!date) return null;
  const offsetMs = UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  const sign = UTC_OFFSET_HOURS >= 0 ? '+' : '-';
  const abs = Math.abs(UTC_OFFSET_HOURS).toString().padStart(2, '0');
  return local.toISOString().replace('Z', `${sign}${abs}:00`);
}

function buildAuthWhereSql(params?: {
  startDate?: Date;
  endDate?: Date;
  extra?: Prisma.Sql[];
}) {
  const clauses: Prisma.Sql[] = [Prisma.sql`event_type IN ('auth.success', 'auth.failed')`];

  if (params?.startDate) clauses.push(Prisma.sql`event_ts >= ${params.startDate}`);
  if (params?.endDate) clauses.push(Prisma.sql`event_ts <= ${params.endDate}`);
  if (params?.extra?.length) clauses.push(...params.extra);

  const combined = clauses.slice(1).reduce(
    (sql, clause) => Prisma.sql`${sql} AND ${clause}`,
    clauses[0],
  );

  return Prisma.sql`WHERE ${combined}`;
}

function buildWhereFromClauses(clauses: Prisma.Sql[]) {
  const combined = clauses.slice(1).reduce(
    (sql, clause) => Prisma.sql`${sql} AND ${clause}`,
    clauses[0],
  );

  return Prisma.sql`WHERE ${combined}`;
}

function buildClauseBlock(keyword: 'WHERE' | 'HAVING', clauses: Prisma.Sql[]) {
  const combined = clauses.slice(1).reduce(
    (sql, clause) => Prisma.sql`${sql} AND ${clause}`,
    clauses[0],
  );

  return keyword === 'WHERE'
    ? Prisma.sql`WHERE ${combined}`
    : Prisma.sql`HAVING ${combined}`;
}

function getCredentialsPagination(params: z.infer<typeof credentialsQuerySchema>) {
  const pageSize = Math.min(params.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = ((params.page ?? 1) - 1) * pageSize;
  const page = params.page ?? 1;

  return { page, pageSize, offset };
}

function buildCredentialsSearchClause(search?: string) {
  if (!search?.trim()) return null;

  const trimmed = search.trim();
  const wildcard = `%${trimmed}%`;
  const ipPrefix = /^[0-9a-fA-F:.]+$/.test(trimmed) ? `${trimmed}%` : wildcard;

  return Prisma.sql`(
    COALESCE(username, '') ILIKE ${wildcard}
    OR COALESCE(password, '') ILIKE ${wildcard}
    OR src_ip ILIKE ${ipPrefix}
  )`;
}

function defaultCredentialsSortBy(
  mainTab: CredentialsMainTab,
  rankingType: CredentialsRankingType,
) {
  if (mainTab === 'recent') return 'eventTs';
  if (rankingType === 'pairs') return 'attempts';
  if (rankingType === 'passwords') return 'attempts';
  return 'attempts';
}

function getCredentialsRankingOrderSql(
  rankingType: CredentialsRankingType,
  sortBy: string,
  sortDir: CredentialsSortDirection,
) {
  const direction = sortDir === 'asc' ? 'ASC' : 'DESC';

  const column =
    rankingType === 'pairs'
      ? {
          credentialPair: Prisma.raw(`"username" ${direction} NULLS LAST, "password" ${direction} NULLS LAST`),
          attempts: Prisma.raw(`"attempts" ${direction}, "lastSeen" DESC`),
          successCount: Prisma.raw(`"successCount" ${direction}, "attempts" DESC`),
          failedCount: Prisma.raw(`"failedCount" ${direction}, "attempts" DESC`),
          uniqueIps: Prisma.raw(`"uniqueIps" ${direction}, "attempts" DESC`),
          lastSeen: Prisma.raw(`"lastSeen" ${direction}, "attempts" DESC`),
          firstSeen: Prisma.raw(`"firstSeen" ${direction}, "attempts" DESC`),
        }[sortBy] ?? Prisma.raw(`"attempts" DESC, "lastSeen" DESC`)
      : rankingType === 'passwords'
        ? {
            password: Prisma.raw(`"password" ${direction} NULLS LAST`),
            attempts: Prisma.raw(`"attempts" ${direction}, "successCount" DESC`),
            successCount: Prisma.raw(`"successCount" ${direction}, "attempts" DESC`),
            failedCount: Prisma.raw(`"failedCount" ${direction}, "attempts" DESC`),
            usernameCount: Prisma.raw(`"usernameCount" ${direction}, "attempts" DESC`),
            uniqueIps: Prisma.raw(`"uniqueIps" ${direction}, "attempts" DESC`),
          }[sortBy] ?? Prisma.raw(`"attempts" DESC, "successCount" DESC`)
        : {
            username: Prisma.raw(`"username" ${direction} NULLS LAST`),
            attempts: Prisma.raw(`"attempts" ${direction}, "successCount" DESC`),
            successCount: Prisma.raw(`"successCount" ${direction}, "attempts" DESC`),
            failedCount: Prisma.raw(`"failedCount" ${direction}, "attempts" DESC`),
            passwordCount: Prisma.raw(`"passwordCount" ${direction}, "attempts" DESC`),
            uniqueIps: Prisma.raw(`"uniqueIps" ${direction}, "attempts" DESC`),
          }[sortBy] ?? Prisma.raw(`"attempts" DESC, "successCount" DESC`);

  return Prisma.sql`ORDER BY ${column}`;
}

function getCredentialsRecentOrderSql(sortBy: string, sortDir: CredentialsSortDirection) {
  const direction = sortDir === 'asc' ? 'ASC' : 'DESC';

  const column =
    {
      status: Prisma.raw(`success ${direction} NULLS LAST, event_ts DESC`),
      username: Prisma.raw(`username ${direction} NULLS LAST, event_ts DESC`),
      password: Prisma.raw(`password ${direction} NULLS LAST, event_ts DESC`),
      srcIp: Prisma.raw(`src_ip ${direction}, event_ts DESC`),
      eventTs: Prisma.raw(`event_ts ${direction}`),
    }[sortBy] ?? Prisma.raw(`event_ts DESC`);

  return Prisma.sql`ORDER BY ${column}`;
}

async function getTimeline(
  fastify: FastifyInstance,
  timezone: string,
  startDate: Date,
  endDate: Date,
  bucket: TimelineBucket,
) {
  if (bucket === 'hour') {
    return fastify.prisma.$queryRaw<TimelineRow[]>(Prisma.sql`
      WITH bounds AS (
        SELECT
          date_trunc('hour', timezone(${timezone}, ${startDate}::timestamptz)) AS start_local,
          date_trunc('hour', timezone(${timezone}, ${endDate}::timestamptz)) AS end_local
      ),
      series AS (
        SELECT generate_series(start_local, end_local, interval '1 hour') AS bucket_local
        FROM bounds
      ),
      counts AS (
        SELECT
          date_trunc('hour', timezone(${timezone}, event_ts::timestamptz)) AS bucket_local,
          COUNT(*)::int AS count
        FROM events
        WHERE event_ts::timestamptz >= ${startDate}::timestamptz AND event_ts::timestamptz <= ${endDate}::timestamptz
        GROUP BY 1
      )
      SELECT
        to_char(series.bucket_local, 'YYYY-MM-DD HH24:MI') AS "bucketStart",
        to_char(series.bucket_local, 'HH24:MI') AS label,
        COALESCE(counts.count, 0)::int AS count
      FROM series
      LEFT JOIN counts USING (bucket_local)
      ORDER BY series.bucket_local ASC
    `);
  }

  return fastify.prisma.$queryRaw<TimelineRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT
        date_trunc('day', timezone(${timezone}, ${startDate}::timestamptz)) AS start_local,
        date_trunc('day', timezone(${timezone}, ${endDate}::timestamptz)) AS end_local
    ),
    series AS (
      SELECT generate_series(start_local, end_local, interval '1 day') AS bucket_local
      FROM bounds
    ),
    counts AS (
      SELECT
        date_trunc('day', timezone(${timezone}, event_ts::timestamptz)) AS bucket_local,
        COUNT(*)::int AS count
      FROM events
      WHERE event_ts::timestamptz >= ${startDate}::timestamptz AND event_ts::timestamptz <= ${endDate}::timestamptz
      GROUP BY 1
    )
    SELECT
      to_char(series.bucket_local, 'YYYY-MM-DD') AS "bucketStart",
      to_char(series.bucket_local, 'DD/MM') AS label,
      COALESCE(counts.count, 0)::int AS count
    FROM series
    LEFT JOIN counts USING (bucket_local)
    ORDER BY series.bucket_local ASC
  `);
}

async function getSessionTimeline(
  fastify: FastifyInstance,
  timezone: string,
  startDate: Date,
  endDate: Date,
  bucket: TimelineBucket,
) {
  if (bucket === 'hour') {
    return fastify.prisma.$queryRaw<SessionTimelineRow[]>(Prisma.sql`
      WITH bounds AS (
        SELECT
          date_trunc('hour', timezone(${timezone}, ${startDate}::timestamptz)) AS start_local,
          date_trunc('hour', timezone(${timezone}, ${endDate}::timestamptz)) AS end_local
      ),
      series AS (
        SELECT generate_series(start_local, end_local, interval '1 hour') AS bucket_local
        FROM bounds
      ),
      counts AS (
        SELECT
          date_trunc('hour', timezone(${timezone}, started_at::timestamptz)) AS bucket_local,
          COUNT(*)::int AS sessions,
          COUNT(*) FILTER (WHERE login_success IS TRUE)::int AS "successfulLogins"
        FROM sessions
        WHERE started_at::timestamptz >= ${startDate}::timestamptz
          AND started_at::timestamptz <= ${endDate}::timestamptz
        GROUP BY 1
      )
      SELECT
        to_char(series.bucket_local, 'YYYY-MM-DD HH24:MI') AS "bucketStart",
        to_char(series.bucket_local, 'HH24:MI') AS label,
        COALESCE(counts.sessions, 0)::int AS sessions,
        COALESCE(counts."successfulLogins", 0)::int AS "successfulLogins"
      FROM series
      LEFT JOIN counts USING (bucket_local)
      ORDER BY series.bucket_local ASC
    `);
  }

  return fastify.prisma.$queryRaw<SessionTimelineRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT
        date_trunc('day', timezone(${timezone}, ${startDate}::timestamptz)) AS start_local,
        date_trunc('day', timezone(${timezone}, ${endDate}::timestamptz)) AS end_local
    ),
    series AS (
      SELECT generate_series(start_local, end_local, interval '1 day') AS bucket_local
      FROM bounds
    ),
    counts AS (
      SELECT
        date_trunc('day', timezone(${timezone}, started_at::timestamptz)) AS bucket_local,
        COUNT(*)::int AS sessions,
        COUNT(*) FILTER (WHERE login_success IS TRUE)::int AS "successfulLogins"
      FROM sessions
      WHERE started_at::timestamptz >= ${startDate}::timestamptz
        AND started_at::timestamptz <= ${endDate}::timestamptz
      GROUP BY 1
    )
    SELECT
      to_char(series.bucket_local, 'YYYY-MM-DD') AS "bucketStart",
      to_char(series.bucket_local, 'DD/MM') AS label,
      COALESCE(counts.sessions, 0)::int AS sessions,
      COALESCE(counts."successfulLogins", 0)::int AS "successfulLogins"
    FROM series
    LEFT JOIN counts USING (bucket_local)
    ORDER BY series.bucket_local ASC
  `);
}

/**
 * GET /stats/session-commands
 * Returns a map of { [sessionId]: string[] } with all commands per session.
 * Used by the dashboard for behavioral clustering.
 */
export async function statsRoutes(fastify: FastifyInstance) {
  fastify.get('/stats/overview', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const now = new Date();
    const range = query.range === 'week' || query.range === 'month' ? query.range : 'day';
    const timezone = query.timezone || 'UTC';
    const endDate = parseDate(query.endDate, now);
    const defaultStart = new Date(now);

    if (range === 'week') {
      defaultStart.setDate(defaultStart.getDate() - 6);
    } else if (range === 'month') {
      defaultStart.setDate(defaultStart.getDate() - 29);
    } else {
      defaultStart.setHours(defaultStart.getHours() - 23);
    }

    const startDate = parseDate(query.startDate, defaultStart);
    const sessionWhere = {
      startedAt: {
        gte: startDate,
        lte: endDate,
      },
    };
    const eventWhere = {
      eventTs: {
        gte: startDate,
        lte: endDate,
      },
    };
    const authWhere = {
      ...eventWhere,
      eventType: { in: ['auth.success', 'auth.failed'] },
    };

    const [totalSessions, totalCommands, successfulLogins, failedLogins, uniqueIpRows, topCommandsRows, topUsernames, topPasswords, timeline] =
      await Promise.all([
        fastify.prisma.session.count({ where: sessionWhere }),
        fastify.prisma.event.count({
          where: {
            ...eventWhere,
            eventType: 'command.input',
            command: { not: null },
          },
        }),
        fastify.prisma.event.count({
          where: {
            ...eventWhere,
            eventType: 'auth.success',
          },
        }),
        fastify.prisma.event.count({
          where: {
            ...eventWhere,
            eventType: 'auth.failed',
          },
        }),
        fastify.prisma.$queryRaw<CountRow[]>(Prisma.sql`
          SELECT COUNT(DISTINCT src_ip)::int AS count
          FROM sessions
          WHERE started_at >= ${startDate} AND started_at <= ${endDate}
        `),
        fastify.prisma.$queryRaw<CommandRow[]>(Prisma.sql`
          SELECT
            NULLIF(split_part(btrim(command), ' ', 1), '') AS command,
            COUNT(*)::int AS count
          FROM events
          WHERE event_type = 'command.input'
            AND command IS NOT NULL
            AND event_ts >= ${startDate}
            AND event_ts <= ${endDate}
          GROUP BY 1
          HAVING NULLIF(split_part(btrim(command), ' ', 1), '') IS NOT NULL
          ORDER BY count DESC, command ASC
          LIMIT 10
        `),
        fastify.prisma.event.groupBy({
          by: ['username'],
          where: {
            ...authWhere,
            username: { not: null },
          },
          _count: { username: true },
          orderBy: { _count: { username: 'desc' } },
          take: 10,
        }),
        fastify.prisma.event.groupBy({
          by: ['password'],
          where: {
            ...authWhere,
            password: { not: null },
          },
          _count: { password: true },
          orderBy: { _count: { password: 'desc' } },
          take: 10,
        }),
        getSessionTimeline(fastify, timezone, startDate, endDate, range === 'day' ? 'hour' : 'day'),
      ]);
    const topCommands = topCommandsRows as CommandRow[];
    const timelineRows = timeline as SessionTimelineRow[];

    return {
      totalSessions,
      totalCommands,
      uniqueIps: toNumber(uniqueIpRows[0]?.count),
      successfulLogins,
      failedLogins,
      topCommands: topCommands.map((row) => ({
        command: row.command,
        count: toNumber(row.count),
      })),
      topUsernames: (topUsernames as GroupedUsernameRow[])
        .filter((row): row is GroupedUsernameRow & { username: string } => Boolean(row.username))
        .map((row) => ({
          username: row.username,
          count: toNumber(row._count.username),
        })),
      topPasswords: (topPasswords as GroupedPasswordRow[])
        .filter((row): row is GroupedPasswordRow & { password: string } => Boolean(row.password))
        .map((row) => ({
          password: row.password,
          count: toNumber(row._count.password),
        })),
      timeline: timelineRows.map((row) => ({
        bucketStart: row.bucketStart,
        label: row.label,
        sessions: row.sessions,
        successfulLogins: row.successfulLogins,
      })),
    };
  });

  fastify.get('/stats/dashboards', async () => {
    const [
      windowRows,
      funnelRows,
      countrySuccessCandidates,
      credentialCampaignRows,
      recurringIpRows,
      commandPatternRows,
      depthBucketRows,
      depthStatsRows,
    ] = await Promise.all([
      fastify.prisma.$queryRaw<InsightWindowRow[]>(Prisma.sql`
        SELECT
          MIN(started_at) AS "firstSeen",
          MAX(COALESCE(ended_at, started_at)) AS "lastSeen",
          COUNT(*)::int AS "totalSessions",
          COUNT(DISTINCT src_ip)::int AS "uniqueIps"
        FROM sessions
      `),
      fastify.prisma.$queryRaw<FunnelRow[]>(Prisma.sql`
        WITH event_flags AS (
          SELECT
            session_id,
            bool_or(event_type = 'session.connect') AS has_connect,
            bool_or(event_type IN ('auth.success', 'auth.failed')) AS has_auth,
            bool_or(event_type = 'auth.success') AS has_success,
            bool_or(event_type = 'command.input') AS has_command,
            bool_or(
              event_type = 'command.input'
              AND (
                (command ILIKE '%authorized_keys%' AND (command ILIKE '%chattr%' OR command ILIKE '%ssh-rsa%' OR command ILIKE '%ssh-ed25519%'))
                OR command ILIKE '%xmrig%'
                OR command ILIKE '%minerd%'
                OR command ILIKE '%pool.minexmr%'
                OR command ILIKE '%stratum+tcp%'
                OR (
                  (command ILIKE '%wget http%' OR command ILIKE '%curl http%')
                  AND (command ILIKE '%chmod +x%' OR command ILIKE '%/tmp/%')
                )
                OR command ILIKE '%crontab%'
              )
            ) AS has_high_signal_compromise
          FROM events
          GROUP BY session_id
        )
        SELECT
          COUNT(*) FILTER (WHERE has_connect)::int AS connections,
          COUNT(*) FILTER (WHERE has_auth)::int AS "authAttempts",
          COUNT(*) FILTER (WHERE has_success)::int AS "loginSuccess",
          COUNT(*) FILTER (WHERE has_command)::int AS commands,
          COUNT(*) FILTER (WHERE has_high_signal_compromise)::int AS "highSignalCompromise"
        FROM event_flags
      `),
      fastify.prisma.$queryRaw<CountrySuccessCandidateRow[]>(Prisma.sql`
        SELECT
          src_ip AS "srcIp",
          COUNT(*)::int AS sessions,
          COUNT(*) FILTER (WHERE login_success IS TRUE)::int AS successes
        FROM sessions
        GROUP BY src_ip
      `),
      fastify.prisma.$queryRaw<CredentialCampaignRow[]>(Prisma.sql`
        WITH auth_events AS (
          SELECT
            date_bin('6 hours', event_ts, TIMESTAMP '2001-01-01') AS bucket_start,
            username,
            password,
            src_ip,
            success
          FROM events
          WHERE event_type IN ('auth.success', 'auth.failed')
            AND (username IS NOT NULL OR password IS NOT NULL)
        )
        SELECT
          bucket_start AS "bucketStart",
          username,
          password,
          COUNT(*)::int AS attempts,
          COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
          COUNT(DISTINCT src_ip)::int AS "uniqueIps",
          ARRAY_AGG(DISTINCT src_ip ORDER BY src_ip) AS ips
        FROM auth_events
        GROUP BY bucket_start, username, password
        HAVING COUNT(DISTINCT src_ip) >= 3
        ORDER BY "uniqueIps" DESC, attempts DESC, bucket_start DESC
        LIMIT 20
      `),
      fastify.prisma.$queryRaw<RecurringIpRow[]>(Prisma.sql`
        WITH per_ip AS (
          SELECT
            src_ip,
            COUNT(*)::int AS total_sessions,
            COUNT(*) FILTER (WHERE login_success IS FALSE)::int AS failed_sessions,
            COUNT(*) FILTER (WHERE login_success IS TRUE)::int AS successful_sessions,
            COUNT(DISTINCT CONCAT(COALESCE(username, ''), ':', COALESCE(password, '')))::int AS credential_count,
            MIN(started_at) AS first_seen,
            MAX(started_at) AS last_seen,
            MIN(started_at) FILTER (WHERE login_success IS FALSE) AS first_failed_at,
            (ARRAY_AGG(client_version ORDER BY started_at ASC))[1] AS client_version
          FROM sessions
          GROUP BY src_ip
          HAVING COUNT(*) >= 2 AND COUNT(*) FILTER (WHERE login_success IS FALSE) >= 1
        ),
        next_attempt AS (
          SELECT
            p.src_ip,
            MIN(s.started_at) AS next_attempt_at
          FROM per_ip p
          INNER JOIN sessions s
            ON s.src_ip = p.src_ip
           AND p.first_failed_at IS NOT NULL
           AND s.started_at > p.first_failed_at
          GROUP BY p.src_ip
        )
        SELECT
          p.src_ip AS "srcIp",
          p.total_sessions AS "totalSessions",
          p.failed_sessions AS "failedSessions",
          p.successful_sessions AS "successfulSessions",
          p.credential_count AS "credentialCount",
          p.first_seen AS "firstSeen",
          p.last_seen AS "lastSeen",
          CASE
            WHEN p.first_failed_at IS NOT NULL AND n.next_attempt_at IS NOT NULL THEN
              FLOOR(EXTRACT(EPOCH FROM (n.next_attempt_at - p.first_failed_at)) / 60)::int
            ELSE NULL
          END AS "returnAfterMinutes",
          p.client_version AS "clientVersion"
        FROM per_ip p
        LEFT JOIN next_attempt n ON n.src_ip = p.src_ip
        ORDER BY "totalSessions" DESC, "credentialCount" DESC, "successfulSessions" DESC
        LIMIT 20
      `),
      fastify.prisma.$queryRaw<CommandPatternRow[]>(Prisma.sql`
        WITH successful_sessions AS (
          SELECT id, src_ip
          FROM sessions
          WHERE login_success IS TRUE
        ),
        ranked_commands AS (
          SELECT
            s.id AS session_id,
            s.src_ip,
            e.command,
            ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY e.event_ts ASC) AS rn
          FROM successful_sessions s
          INNER JOIN events e ON e.session_id = s.id
          WHERE e.event_type = 'command.input'
            AND e.command IS NOT NULL
        ),
        per_session AS (
          SELECT
            session_id,
            MAX(src_ip) AS src_ip,
            array_remove(array_agg(command ORDER BY rn) FILTER (WHERE rn <= 4), NULL) AS commands
          FROM ranked_commands
          GROUP BY session_id
        )
        SELECT
          array_to_string(commands, ' -> ') AS sequence,
          COUNT(*)::int AS sessions,
          COUNT(DISTINCT src_ip)::int AS "uniqueIps"
        FROM per_session
        WHERE array_length(commands, 1) IS NOT NULL
        GROUP BY sequence
        ORDER BY sessions DESC, "uniqueIps" DESC, sequence ASC
        LIMIT 15
      `),
      fastify.prisma.$queryRaw<DepthBucketRow[]>(Prisma.sql`
        WITH successful_command_counts AS (
          SELECT
            s.id,
            COUNT(*) FILTER (WHERE e.event_type = 'command.input')::int AS command_count
          FROM sessions s
          LEFT JOIN events e ON e.session_id = s.id
          WHERE s.login_success IS TRUE
          GROUP BY s.id
        )
        SELECT
          CASE
            WHEN command_count = 0 THEN '0'
            WHEN command_count BETWEEN 1 AND 3 THEN '1-3'
            WHEN command_count BETWEEN 4 AND 10 THEN '4-10'
            WHEN command_count BETWEEN 11 AND 20 THEN '11-20'
            ELSE '21+'
          END AS bucket,
          COUNT(*)::int AS sessions
        FROM successful_command_counts
        GROUP BY bucket
      `),
      fastify.prisma.$queryRaw<DepthStatsRow[]>(Prisma.sql`
        WITH successful_command_counts AS (
          SELECT
            s.id,
            COUNT(*) FILTER (WHERE e.event_type = 'command.input')::int AS command_count
          FROM sessions s
          LEFT JOIN events e ON e.session_id = s.id
          WHERE s.login_success IS TRUE
          GROUP BY s.id
        )
        SELECT
          ROUND(AVG(command_count)::numeric, 2)::float AS "averageCommands",
          MAX(command_count)::int AS "maxCommands",
          COUNT(*) FILTER (WHERE command_count >= 20)::int AS "interactiveSessions"
        FROM successful_command_counts
      `),
    ]);

    const window = windowRows[0] ?? {
      firstSeen: null,
      lastSeen: null,
      totalSessions: 0,
      uniqueIps: 0,
    };
    const funnel = funnelRows[0] ?? {
      connections: 0,
      authAttempts: 0,
      loginSuccess: 0,
      commands: 0,
      highSignalCompromise: 0,
    };
    const depthStats = depthStatsRows[0] ?? {
      averageCommands: 0,
      maxCommands: 0,
      interactiveSessions: 0,
    };

    return {
      window: {
        firstSeen: toOffsetISOString(window.firstSeen),
        lastSeen: toOffsetISOString(window.lastSeen),
        totalSessions: toNumber(window.totalSessions),
        uniqueIps: toNumber(window.uniqueIps),
      },
      funnel: {
        connections: toNumber(funnel.connections),
        authAttempts: toNumber(funnel.authAttempts),
        loginSuccess: toNumber(funnel.loginSuccess),
        commands: toNumber(funnel.commands),
        highSignalCompromise: toNumber(funnel.highSignalCompromise),
      },
      countrySuccessCandidates: countrySuccessCandidates.map((row) => ({
        srcIp: row.srcIp,
        sessions: toNumber(row.sessions),
        successes: toNumber(row.successes),
      })),
      credentialCampaigns: credentialCampaignRows.map((row) => ({
        bucketStart: toOffsetISOString(row.bucketStart),
        username: row.username,
        password: row.password,
        attempts: toNumber(row.attempts),
        successCount: toNumber(row.successCount),
        uniqueIps: toNumber(row.uniqueIps),
        ips: row.ips,
      })),
      recurringIps: recurringIpRows.map((row) => ({
        srcIp: row.srcIp,
        totalSessions: toNumber(row.totalSessions),
        failedSessions: toNumber(row.failedSessions),
        successfulSessions: toNumber(row.successfulSessions),
        credentialCount: toNumber(row.credentialCount),
        firstSeen: toOffsetISOString(row.firstSeen),
        lastSeen: toOffsetISOString(row.lastSeen),
        returnAfterMinutes:
          row.returnAfterMinutes === null ? null : toNumber(row.returnAfterMinutes),
        clientVersion: row.clientVersion,
      })),
      commandPatterns: commandPatternRows.map((row) => ({
        sequence: row.sequence,
        sessions: toNumber(row.sessions),
        uniqueIps: toNumber(row.uniqueIps),
      })),
      successfulDepth: {
        buckets: depthBucketRows.map((row) => ({
          bucket: row.bucket,
          sessions: toNumber(row.sessions),
        })),
        averageCommands: depthStats.averageCommands ?? 0,
        maxCommands: depthStats.maxCommands ?? 0,
        interactiveSessions: toNumber(depthStats.interactiveSessions),
      },
    };
  });

  fastify.get('/stats/geo', async () => {
    const rows = await fastify.prisma.$queryRaw<{ srcIp: string; loginSuccess: boolean | null }[]>(Prisma.sql`
      SELECT
        src_ip AS "srcIp",
        BOOL_OR(login_success IS TRUE) AS "loginSuccess"
      FROM sessions
      GROUP BY src_ip
    `);
    return rows;
  });

  fastify.get('/stats/session-commands', async (request) => {
    const { limit = '500' } = request.query as Record<string, string>;

    const events = await fastify.prisma.event.findMany({
      where: { eventType: 'command.input', command: { not: null } },
      select: { sessionId: true, command: true },
      take: Math.min(Number(limit), 5000),
      orderBy: { eventTs: 'asc' },
    });

    const result: Record<string, string[]> = {};
    for (const e of events) {
      if (!e.command) continue;
      if (!result[e.sessionId]) result[e.sessionId] = [];
      result[e.sessionId].push(e.command);
    }

    return result;
  });

  fastify.get('/stats/credentials', async (request, reply) => {
    const parsed = credentialsQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query params',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const startDate = parsed.data.startDate
      ? parseDate(parsed.data.startDate, new Date(0))
      : undefined;
    const endDate = parsed.data.endDate ? parseDate(parsed.data.endDate, new Date()) : undefined;
    const limit = Math.min(parsed.data.limit, 1000);
    const recentLimit = Math.min(parsed.data.recentLimit, 2000);
    const { page, pageSize, offset } = getCredentialsPagination(parsed.data);
    const rankingType = parsed.data.rankingType;
    const mainTab = parsed.data.mainTab;
    const outcome = parsed.data.outcome;
    const frequency = parsed.data.frequency;
    const search = parsed.data.search?.trim();
    const activeSortBy =
      parsed.data.sortBy ?? defaultCredentialsSortBy(mainTab, rankingType);
    const activeSortDir = parsed.data.sortDir;
    const rankingSortBy =
      mainTab === 'rankings'
        ? activeSortBy
        : defaultCredentialsSortBy('rankings', rankingType);
    const rankingSortDir: CredentialsSortDirection =
      mainTab === 'rankings' ? activeSortDir : 'desc';
    const recentSortBy = mainTab === 'recent' ? activeSortBy : 'eventTs';
    const recentSortDir: CredentialsSortDirection =
      mainTab === 'recent' ? activeSortDir : 'desc';

    const authWhere = buildAuthWhereSql({ startDate, endDate });
    const anyCredentialWhere = buildAuthWhereSql({
      startDate,
      endDate,
      extra: [Prisma.sql`(username IS NOT NULL OR password IS NOT NULL)`],
    });
    const usernameWhere = buildAuthWhereSql({
      startDate,
      endDate,
      extra: [Prisma.sql`username IS NOT NULL`],
    });
    const passwordWhere = buildAuthWhereSql({
      startDate,
      endDate,
      extra: [Prisma.sql`password IS NOT NULL`],
    });
    const rankingSearchClause = buildCredentialsSearchClause(search);
    const rankingClauses: Prisma.Sql[] = [Prisma.sql`event_type IN ('auth.success', 'auth.failed')`];

    if (startDate) rankingClauses.push(Prisma.sql`event_ts >= ${startDate}`);
    if (endDate) rankingClauses.push(Prisma.sql`event_ts <= ${endDate}`);
    if (rankingSearchClause) rankingClauses.push(rankingSearchClause);
    if (rankingType === 'pairs') {
      rankingClauses.push(Prisma.sql`(username IS NOT NULL OR password IS NOT NULL)`);
    } else if (rankingType === 'passwords') {
      rankingClauses.push(Prisma.sql`password IS NOT NULL`);
    } else {
      rankingClauses.push(Prisma.sql`username IS NOT NULL`);
    }

    const rankingHavingClauses: Prisma.Sql[] = [Prisma.sql`1 = 1`];
    if (outcome === 'success') {
      rankingHavingClauses.push(Prisma.sql`COUNT(*) FILTER (WHERE success IS TRUE) > 0`);
    } else if (outcome === 'failed') {
      rankingHavingClauses.push(Prisma.sql`COUNT(*) FILTER (WHERE success IS FALSE) > 0`);
    }
    if (rankingType === 'pairs') {
      if (frequency === 'reused') {
        rankingHavingClauses.push(Prisma.sql`COUNT(*) > 1`);
      } else if (frequency === 'single') {
        rankingHavingClauses.push(Prisma.sql`COUNT(*) = 1`);
      }
    }

    const recentWhere = {
      eventType: {
        in:
          outcome === 'success'
            ? ['auth.success']
            : outcome === 'failed'
              ? ['auth.failed']
              : ['auth.success', 'auth.failed'],
      },
      ...((startDate || endDate)
        ? {
            eventTs: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                srcIp: {
                  startsWith: search,
                  mode: 'insensitive' as const,
                },
              },
              { username: { contains: search, mode: 'insensitive' as const } },
              { password: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const recentOrderBy =
      recentSortBy === 'status'
        ? [{ success: recentSortDir }, { eventTs: 'desc' as const }]
        : recentSortBy === 'username'
          ? [{ username: recentSortDir }, { eventTs: 'desc' as const }]
          : recentSortBy === 'password'
            ? [{ password: recentSortDir }, { eventTs: 'desc' as const }]
            : recentSortBy === 'srcIp'
              ? [{ srcIp: recentSortDir }, { eventTs: 'desc' as const }]
              : [{ eventTs: recentSortDir }];

    const [
      totalAttempts,
      successfulAttempts,
      failedAttempts,
      uniqueUsernamesRows,
      uniquePasswordsRows,
      uniquePairsRows,
      repeatedPairsRows,
      sprayPasswordsCountRows,
      targetedUsernamesCountRows,
      sprayPasswordRows,
      targetedUsernameRows,
      diversifiedAttackerRows,
      rankingCountRows,
      rankingRows,
      recentAttempts,
      recentAttemptsTotal,
    ] = await Promise.all([
      fastify.prisma.event.count({
        where: {
          eventType: { in: ['auth.success', 'auth.failed'] },
          ...(startDate || endDate
            ? {
                eventTs: {
                  ...(startDate ? { gte: startDate } : {}),
                  ...(endDate ? { lte: endDate } : {}),
                },
              }
            : {}),
        },
      }),
      fastify.prisma.event.count({
        where: {
          eventType: 'auth.success',
          ...(startDate || endDate
            ? {
                eventTs: {
                  ...(startDate ? { gte: startDate } : {}),
                  ...(endDate ? { lte: endDate } : {}),
                },
              }
            : {}),
        },
      }),
      fastify.prisma.event.count({
        where: {
          eventType: 'auth.failed',
          ...(startDate || endDate
            ? {
                eventTs: {
                  ...(startDate ? { gte: startDate } : {}),
                  ...(endDate ? { lte: endDate } : {}),
                },
              }
            : {}),
        },
      }),
      fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`
        SELECT COUNT(DISTINCT username)::int AS count
        FROM events
        ${usernameWhere}
      `),
      fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`
        SELECT COUNT(DISTINCT password)::int AS count
        FROM events
        ${passwordWhere}
      `),
      fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`
        SELECT COUNT(DISTINCT (COALESCE(username, '<null>') || E'\\x1f' || COALESCE(password, '<null>')))::int AS count
        FROM events
        ${anyCredentialWhere}
      `),
      fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM (
          SELECT 1
          FROM events
          ${anyCredentialWhere}
          GROUP BY username, password
          HAVING COUNT(*) > 1
        ) repeated_pairs
      `),
      fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM (
          SELECT password
          FROM events
          ${passwordWhere}
          GROUP BY password
          HAVING COUNT(DISTINCT username) >= 3
        ) sprayed_passwords
      `),
      fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM (
          SELECT username
          FROM events
          ${usernameWhere}
          GROUP BY username
          HAVING COUNT(DISTINCT password) >= 3
        ) targeted_usernames
      `),
      fastify.prisma.$queryRaw<SprayPasswordRow[]>(Prisma.sql`
        SELECT
          password,
          COUNT(*)::int AS attempts,
          COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
          COUNT(DISTINCT username)::int AS "usernameCount",
          COUNT(DISTINCT src_ip)::int AS "ipCount"
        FROM events
        ${passwordWhere}
        GROUP BY password
        HAVING COUNT(DISTINCT username) >= 2
        ORDER BY "usernameCount" DESC, attempts DESC, "successCount" DESC
        LIMIT 20
      `),
      fastify.prisma.$queryRaw<TargetedUsernameRow[]>(Prisma.sql`
        SELECT
          username,
          COUNT(*)::int AS attempts,
          COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
          COUNT(DISTINCT password)::int AS "passwordCount",
          COUNT(DISTINCT src_ip)::int AS "ipCount"
        FROM events
        ${usernameWhere}
        GROUP BY username
        HAVING COUNT(DISTINCT password) >= 2
        ORDER BY "passwordCount" DESC, attempts DESC, "successCount" DESC
        LIMIT 20
      `),
      fastify.prisma.$queryRaw<DiversifiedAttackerRow[]>(Prisma.sql`
        SELECT
          src_ip AS "srcIp",
          COUNT(*)::int AS attempts,
          COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
          COUNT(DISTINCT (COALESCE(username, '<null>') || E'\\x1f' || COALESCE(password, '<null>')))::int AS "credentialCount",
          COUNT(DISTINCT username)::int AS "usernameCount",
          COUNT(DISTINCT password)::int AS "passwordCount",
          MAX(event_ts) AS "lastSeen"
        FROM events
        ${authWhere}
        GROUP BY src_ip
        HAVING COUNT(*) >= 2
        ORDER BY "credentialCount" DESC, attempts DESC, "successCount" DESC
        LIMIT 20
      `),
      rankingType === 'pairs'
        ? fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`
            WITH grouped AS (
              SELECT
                username,
                password,
                COUNT(*)::int AS attempts,
                COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
                COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount",
                COUNT(DISTINCT src_ip)::int AS "uniqueIps",
                MIN(event_ts) AS "firstSeen",
                MAX(event_ts) AS "lastSeen"
              FROM events
              ${buildClauseBlock('WHERE', rankingClauses)}
              GROUP BY username, password
              ${buildClauseBlock('HAVING', rankingHavingClauses)}
            )
            SELECT COUNT(*)::int AS count
            FROM grouped
          `)
        : rankingType === 'passwords'
          ? fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`
              WITH grouped AS (
                SELECT
                  password,
                  COUNT(*)::int AS attempts,
                  COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
                  COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount",
                  COUNT(DISTINCT src_ip)::int AS "uniqueIps",
                  COUNT(DISTINCT username)::int AS "usernameCount"
                FROM events
                ${buildClauseBlock('WHERE', rankingClauses)}
                GROUP BY password
                ${buildClauseBlock('HAVING', rankingHavingClauses)}
              )
              SELECT COUNT(*)::int AS count
              FROM grouped
            `)
          : fastify.prisma.$queryRaw<CountOnlyRow[]>(Prisma.sql`
              WITH grouped AS (
                SELECT
                  username,
                  COUNT(*)::int AS attempts,
                  COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
                  COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount",
                  COUNT(DISTINCT src_ip)::int AS "uniqueIps",
                  COUNT(DISTINCT password)::int AS "passwordCount"
                FROM events
                ${buildClauseBlock('WHERE', rankingClauses)}
                GROUP BY username
                ${buildClauseBlock('HAVING', rankingHavingClauses)}
              )
              SELECT COUNT(*)::int AS count
              FROM grouped
            `),
      rankingType === 'pairs'
        ? fastify.prisma.$queryRaw<CredentialPairRow[]>(Prisma.sql`
            WITH grouped AS (
              SELECT
                username,
                password,
                COUNT(*)::int AS attempts,
                COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
                COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount",
                COUNT(DISTINCT src_ip)::int AS "uniqueIps",
                MIN(event_ts) AS "firstSeen",
                MAX(event_ts) AS "lastSeen"
              FROM events
              ${buildClauseBlock('WHERE', rankingClauses)}
              GROUP BY username, password
              ${buildClauseBlock('HAVING', rankingHavingClauses)}
            )
            SELECT *
            FROM grouped
            ${getCredentialsRankingOrderSql(rankingType, rankingSortBy, rankingSortDir)}
            LIMIT ${pageSize}
            OFFSET ${offset}
          `)
        : rankingType === 'passwords'
          ? fastify.prisma.$queryRaw<PasswordAggregateRow[]>(Prisma.sql`
              WITH grouped AS (
                SELECT
                  password,
                  COUNT(*)::int AS attempts,
                  COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
                  COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount",
                  COUNT(DISTINCT src_ip)::int AS "uniqueIps",
                  COUNT(DISTINCT username)::int AS "usernameCount"
                FROM events
                ${buildClauseBlock('WHERE', rankingClauses)}
                GROUP BY password
                ${buildClauseBlock('HAVING', rankingHavingClauses)}
              )
              SELECT *
              FROM grouped
              ${getCredentialsRankingOrderSql(rankingType, rankingSortBy, rankingSortDir)}
              LIMIT ${pageSize}
              OFFSET ${offset}
            `)
          : fastify.prisma.$queryRaw<UsernameAggregateRow[]>(Prisma.sql`
              WITH grouped AS (
                SELECT
                  username,
                  COUNT(*)::int AS attempts,
                  COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
                  COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount",
                  COUNT(DISTINCT src_ip)::int AS "uniqueIps",
                  COUNT(DISTINCT password)::int AS "passwordCount"
                FROM events
                ${buildClauseBlock('WHERE', rankingClauses)}
                GROUP BY username
                ${buildClauseBlock('HAVING', rankingHavingClauses)}
              )
              SELECT *
              FROM grouped
              ${getCredentialsRankingOrderSql(rankingType, rankingSortBy, rankingSortDir)}
              LIMIT ${pageSize}
              OFFSET ${offset}
            `),
      fastify.prisma.event.findMany({
        where: recentWhere,
        orderBy: recentOrderBy,
        take: pageSize,
        skip: offset,
      }),
      fastify.prisma.event.count({ where: recentWhere }),
    ]);

    const rankingTotal = toNumber(rankingCountRows[0]?.count);
    const rankingTotalPages = rankingTotal === 0 ? 1 : Math.ceil(rankingTotal / pageSize);
    const recentTotalPages =
      recentAttemptsTotal === 0 ? 1 : Math.ceil(recentAttemptsTotal / pageSize);

    return {
      summary: {
        totalAttempts,
        successfulAttempts,
        failedAttempts,
        uniqueUsernames: toNumber(uniqueUsernamesRows[0]?.count),
        uniquePasswords: toNumber(uniquePasswordsRows[0]?.count),
        uniqueCredentialPairs: toNumber(uniquePairsRows[0]?.count),
        repeatedCredentialPairs: toNumber(repeatedPairsRows[0]?.count),
        sprayPasswords: toNumber(sprayPasswordsCountRows[0]?.count),
        targetedUsernames: toNumber(targetedUsernamesCountRows[0]?.count),
        successRate: totalAttempts > 0 ? successfulAttempts / totalAttempts : 0,
      },
      sprayPasswords: sprayPasswordRows.map((row) => ({
        password: row.password,
        attempts: toNumber(row.attempts),
        successCount: toNumber(row.successCount),
        usernameCount: toNumber(row.usernameCount),
        ipCount: toNumber(row.ipCount),
      })),
      targetedUsernames: targetedUsernameRows.map((row) => ({
        username: row.username,
        attempts: toNumber(row.attempts),
        successCount: toNumber(row.successCount),
        passwordCount: toNumber(row.passwordCount),
        ipCount: toNumber(row.ipCount),
      })),
      diversifiedAttackers: diversifiedAttackerRows.map((row) => ({
        srcIp: row.srcIp,
        attempts: toNumber(row.attempts),
        successCount: toNumber(row.successCount),
        credentialCount: toNumber(row.credentialCount),
        usernameCount: toNumber(row.usernameCount),
        passwordCount: toNumber(row.passwordCount),
        lastSeen: toOffsetISOString(row.lastSeen),
      })),
      rankingsPage: {
        items:
          rankingType === 'pairs'
            ? (rankingRows as CredentialPairRow[]).map((row) => ({
                username: row.username,
                password: row.password,
                attempts: toNumber(row.attempts),
                successCount: toNumber(row.successCount),
                failedCount: toNumber(row.failedCount),
                uniqueIps: toNumber(row.uniqueIps),
                firstSeen: toOffsetISOString(row.firstSeen),
                lastSeen: toOffsetISOString(row.lastSeen),
              }))
            : rankingType === 'passwords'
              ? (rankingRows as PasswordAggregateRow[]).map((row) => ({
                  password: row.password,
                  attempts: toNumber(row.attempts),
                  successCount: toNumber(row.successCount),
                  failedCount: toNumber(row.failedCount),
                  uniqueIps: toNumber(row.uniqueIps),
                  usernameCount: toNumber(row.usernameCount),
                }))
              : (rankingRows as UsernameAggregateRow[]).map((row) => ({
                  username: row.username,
                  attempts: toNumber(row.attempts),
                  successCount: toNumber(row.successCount),
                  failedCount: toNumber(row.failedCount),
                  uniqueIps: toNumber(row.uniqueIps),
                  passwordCount: toNumber(row.passwordCount),
                })),
        pagination: {
          page,
          pageSize,
          total: rankingTotal,
          totalPages: rankingTotalPages,
          hasNextPage: page < rankingTotalPages,
          hasPreviousPage: page > 1,
        },
        sortBy: rankingSortBy,
        sortDir: rankingSortDir,
      },
      recentAttemptsPage: {
        items: recentAttempts.map((event) => ({
          ...event,
          eventTs: toOffsetISOString(event.eventTs),
          createdAt: toOffsetISOString(event.createdAt),
          cowrieTs: toOffsetISOString(new Date(event.cowrieTs as string)),
        })),
        pagination: {
          page,
          pageSize,
          total: recentAttemptsTotal,
          totalPages: recentTotalPages,
          hasNextPage: page < recentTotalPages,
          hasPreviousPage: page > 1,
        },
        sortBy: recentSortBy,
        sortDir: recentSortDir,
      },
      current: {
        mainTab,
        rankingType,
        outcome,
        frequency,
        search: search ?? '',
        sortBy: activeSortBy,
        sortDir: activeSortDir,
      },
    };
  });

  // Attack heatmap: sessions grouped by day-of-week × hour
  fastify.get('/stats/heatmap', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const timezone = query.timezone || 'UTC';
    const days = Math.min(Math.max(parseInt(query.days || '90', 10), 1), 365);

    interface HeatmapRow { dow: number; hour: number; count: bigint }

    const rows = await fastify.prisma.$queryRaw<HeatmapRow[]>(Prisma.sql`
      SELECT
        EXTRACT(DOW  FROM started_at AT TIME ZONE ${timezone})::int AS dow,
        EXTRACT(HOUR FROM started_at AT TIME ZONE ${timezone})::int AS hour,
        COUNT(*)::bigint AS count
      FROM sessions
      WHERE started_at >= NOW() - (${days} || ' days')::interval
      GROUP BY dow, hour
      ORDER BY dow, hour
    `);

    const cells = rows.map(r => ({ dow: r.dow, hour: r.hour, count: Number(r.count) }));
    const maxCount = cells.reduce((m, c) => Math.max(m, c.count), 0);
    const totalSessions = cells.reduce((s, c) => s + c.count, 0);

    // Hour totals (for bar chart below heatmap)
    const hourTotals = Array.from({ length: 24 }, (_, h) =>
      cells.filter(c => c.hour === h).reduce((s, c) => s + c.count, 0)
    );

    return { cells, maxCount, totalSessions, hourTotals, days };
  });
}
