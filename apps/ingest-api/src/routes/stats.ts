import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

type TimelineBucket = 'hour' | 'day';

interface TimelineRow {
  bucketStart: string;
  label: string;
  count: number;
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
        getTimeline(fastify, timezone, startDate, endDate, range === 'day' ? 'hour' : 'day'),
      ]);
    const topCommands = topCommandsRows as CommandRow[];
    const timelineRows = timeline as TimelineRow[];

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
        count: toNumber(row.count),
      })),
    };
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

  fastify.get('/stats/credentials', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const startDate = query.startDate ? parseDate(query.startDate, new Date(0)) : undefined;
    const endDate = query.endDate ? parseDate(query.endDate, new Date()) : undefined;
    const limit = Math.min(Number(query.limit ?? '250'), 1000);
    const recentLimit = Math.min(Number(query.recentLimit ?? '500'), 2000);

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
      topCredentialsRows,
      topUsernamesRows,
      topPasswordsRows,
      sprayPasswordRows,
      targetedUsernameRows,
      diversifiedAttackerRows,
      recentAttempts,
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
      fastify.prisma.$queryRaw<CredentialPairRow[]>(Prisma.sql`
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
        ${anyCredentialWhere}
        GROUP BY username, password
        ORDER BY attempts DESC, "successCount" DESC, "lastSeen" DESC
        LIMIT ${limit}
      `),
      fastify.prisma.$queryRaw<UsernameAggregateRow[]>(Prisma.sql`
        SELECT
          username,
          COUNT(*)::int AS attempts,
          COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
          COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount",
          COUNT(DISTINCT src_ip)::int AS "uniqueIps",
          COUNT(DISTINCT password)::int AS "passwordCount"
        FROM events
        ${usernameWhere}
        GROUP BY username
        ORDER BY attempts DESC, "successCount" DESC, username ASC
        LIMIT ${limit}
      `),
      fastify.prisma.$queryRaw<PasswordAggregateRow[]>(Prisma.sql`
        SELECT
          password,
          COUNT(*)::int AS attempts,
          COUNT(*) FILTER (WHERE success IS TRUE)::int AS "successCount",
          COUNT(*) FILTER (WHERE success IS FALSE)::int AS "failedCount",
          COUNT(DISTINCT src_ip)::int AS "uniqueIps",
          COUNT(DISTINCT username)::int AS "usernameCount"
        FROM events
        ${passwordWhere}
        GROUP BY password
        ORDER BY attempts DESC, "successCount" DESC, password ASC
        LIMIT ${limit}
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
      fastify.prisma.event.findMany({
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
        orderBy: { eventTs: 'desc' },
        take: recentLimit,
      }),
    ]);

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
      topCredentials: topCredentialsRows.map((row) => ({
        username: row.username,
        password: row.password,
        attempts: toNumber(row.attempts),
        successCount: toNumber(row.successCount),
        failedCount: toNumber(row.failedCount),
        uniqueIps: toNumber(row.uniqueIps),
        firstSeen: toOffsetISOString(row.firstSeen),
        lastSeen: toOffsetISOString(row.lastSeen),
      })),
      topUsernames: topUsernamesRows.map((row) => ({
        username: row.username,
        attempts: toNumber(row.attempts),
        successCount: toNumber(row.successCount),
        failedCount: toNumber(row.failedCount),
        uniqueIps: toNumber(row.uniqueIps),
        passwordCount: toNumber(row.passwordCount),
      })),
      topPasswords: topPasswordsRows.map((row) => ({
        password: row.password,
        attempts: toNumber(row.attempts),
        successCount: toNumber(row.successCount),
        failedCount: toNumber(row.failedCount),
        uniqueIps: toNumber(row.uniqueIps),
        usernameCount: toNumber(row.usernameCount),
      })),
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
      recentAttempts: recentAttempts.map((event) => ({
        ...event,
        eventTs: toOffsetISOString(event.eventTs),
        createdAt: toOffsetISOString(event.createdAt),
        cowrieTs: toOffsetISOString(new Date(event.cowrieTs as string)),
      })),
    };
  });
}
