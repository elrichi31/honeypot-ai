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

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function toNumber(value: number | bigint | null | undefined): number {
  if (typeof value === 'bigint') return Number(value);
  return value ?? 0;
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
}
