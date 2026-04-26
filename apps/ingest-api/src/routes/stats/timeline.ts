import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { TimelineBucket, TimelineRow, SessionTimelineRow, CommandRow, GroupedUsernameRow, GroupedPasswordRow, CountRow } from './types.js'
import { parseDate, toNumber } from './utils.js'

async function getTimeline(
  fastify: FastifyInstance, timezone: string,
  startDate: Date, endDate: Date, bucket: TimelineBucket,
): Promise<TimelineRow[]> {
  const interval = bucket === 'hour' ? "interval '1 hour'" : "interval '1 day'"
  const truncUnit = bucket === 'hour' ? 'hour' : 'day'
  const format = bucket === 'hour' ? 'YYYY-MM-DD HH24:MI' : 'YYYY-MM-DD'
  const label = bucket === 'hour' ? 'HH24:MI' : 'DD/MM'

  return fastify.prisma.$queryRaw<TimelineRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT date_trunc(${truncUnit}, timezone(${timezone}, ${startDate}::timestamptz)) AS start_local,
             date_trunc(${truncUnit}, timezone(${timezone}, ${endDate}::timestamptz))   AS end_local
    ),
    series AS (SELECT generate_series(start_local, end_local, ${Prisma.raw(interval)}) AS bucket_local FROM bounds),
    counts AS (
      SELECT date_trunc(${truncUnit}, timezone(${timezone}, event_ts::timestamptz)) AS bucket_local,
             COUNT(*)::int AS count
      FROM events
      WHERE event_ts::timestamptz >= ${startDate}::timestamptz AND event_ts::timestamptz <= ${endDate}::timestamptz
      GROUP BY 1
    )
    SELECT to_char(series.bucket_local, ${format}) AS "bucketStart",
           to_char(series.bucket_local, ${label})  AS label,
           COALESCE(counts.count, 0)::int           AS count
    FROM series LEFT JOIN counts USING (bucket_local)
    ORDER BY series.bucket_local ASC
  `)
}

async function getSessionTimeline(
  fastify: FastifyInstance, timezone: string,
  startDate: Date, endDate: Date, bucket: TimelineBucket,
): Promise<SessionTimelineRow[]> {
  const interval = bucket === 'hour' ? "interval '1 hour'" : "interval '1 day'"
  const truncUnit = bucket === 'hour' ? 'hour' : 'day'
  const format = bucket === 'hour' ? 'YYYY-MM-DD HH24:MI' : 'YYYY-MM-DD'
  const label = bucket === 'hour' ? 'HH24:MI' : 'DD/MM'

  return fastify.prisma.$queryRaw<SessionTimelineRow[]>(Prisma.sql`
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

export async function overviewRoute(fastify: FastifyInstance) {
  fastify.get('/stats/overview', async (request) => {
    const query = request.query as Record<string, string | undefined>
    const now = new Date()
    const range = query.range === 'week' || query.range === 'month' ? query.range : 'day'
    const timezone = query.timezone || 'UTC'
    const endDate = parseDate(query.endDate, now)
    const defaultStart = new Date(now)

    if (range === 'week') defaultStart.setDate(defaultStart.getDate() - 6)
    else if (range === 'month') defaultStart.setDate(defaultStart.getDate() - 29)
    else defaultStart.setHours(defaultStart.getHours() - 23)

    const startDate = parseDate(query.startDate, defaultStart)
    const sessionWhere = { startedAt: { gte: startDate, lte: endDate } }
    const eventWhere = { eventTs: { gte: startDate, lte: endDate } }
    const authWhere = { ...eventWhere, eventType: { in: ['auth.success', 'auth.failed'] } }

    const [totalSessions, totalCommands, successfulLogins, failedLogins, uniqueIpRows, topCommandsRows, topUsernames, topPasswords, timeline] =
      await Promise.all([
        fastify.prisma.session.count({ where: sessionWhere }),
        fastify.prisma.event.count({ where: { ...eventWhere, eventType: 'command.input', command: { not: null } } }),
        fastify.prisma.event.count({ where: { ...eventWhere, eventType: 'auth.success' } }),
        fastify.prisma.event.count({ where: { ...eventWhere, eventType: 'auth.failed' } }),
        fastify.prisma.$queryRaw<CountRow[]>(Prisma.sql`
          SELECT COUNT(DISTINCT src_ip)::int AS count FROM sessions
          WHERE started_at >= ${startDate} AND started_at <= ${endDate}
        `),
        fastify.prisma.$queryRaw<CommandRow[]>(Prisma.sql`
          SELECT NULLIF(split_part(btrim(command), ' ', 1), '') AS command, COUNT(*)::int AS count
          FROM events
          WHERE event_type = 'command.input' AND command IS NOT NULL
            AND event_ts >= ${startDate} AND event_ts <= ${endDate}
          GROUP BY 1 HAVING NULLIF(split_part(btrim(command), ' ', 1), '') IS NOT NULL
          ORDER BY count DESC, command ASC LIMIT 10
        `),
        fastify.prisma.event.groupBy({ by: ['username'], where: { ...authWhere, username: { not: null } }, _count: { username: true }, orderBy: { _count: { username: 'desc' } }, take: 10 }),
        fastify.prisma.event.groupBy({ by: ['password'], where: { ...authWhere, password: { not: null } }, _count: { password: true }, orderBy: { _count: { password: 'desc' } }, take: 10 }),
        getSessionTimeline(fastify, timezone, startDate, endDate, range === 'day' ? 'hour' : 'day'),
      ])

    return {
      totalSessions,
      totalCommands,
      uniqueIps: toNumber(uniqueIpRows[0]?.count),
      successfulLogins,
      failedLogins,
      topCommands: (topCommandsRows as CommandRow[]).map(r => ({ command: r.command, count: toNumber(r.count) })),
      topUsernames: (topUsernames as GroupedUsernameRow[]).filter(r => Boolean(r.username)).map(r => ({ username: r.username!, count: toNumber(r._count.username) })),
      topPasswords: (topPasswords as GroupedPasswordRow[]).filter(r => Boolean(r.password)).map(r => ({ password: r.password!, count: toNumber(r._count.password) })),
      timeline: (timeline as SessionTimelineRow[]).map(r => ({ bucketStart: r.bucketStart, label: r.label, sessions: r.sessions, successfulLogins: r.successfulLogins })),
    }
  })
}
