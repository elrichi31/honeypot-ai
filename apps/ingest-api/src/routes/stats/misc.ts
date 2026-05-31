import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { withCache } from '../../lib/cache-helper.js'

interface SshOverviewRow { sessions: bigint; uniqueIps: bigint; successfulLogins: bigint; lastSeen: Date | null }
interface WebOverviewRow { hits: bigint; uniqueIps: bigint; lastSeen: Date | null }
interface WebTopAttackRow { attackType: string }
interface ProtocolOverviewRow { protocol: string; count: bigint; uniqueIps: bigint; authAttempts: bigint; lastSeen: Date | null }

const OVERVIEW_TTL = 1800
const GEO_TTL     = 1800
const TIMELINE_TTL = 600

export async function miscRoutes(fastify: FastifyInstance) {
  fastify.get('/stats/honeypot-overview', () =>
    withCache(fastify.cache, 'stats:honeypot-overview', OVERVIEW_TTL, async () => {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      const [sshRows, webRows, webTopAttackRows, protocolRows] = await Promise.all([
        fastify.prisma.$queryRaw<SshOverviewRow[]>(Prisma.sql`
          SELECT COUNT(*)::bigint AS sessions,
                 COUNT(DISTINCT src_ip)::bigint AS "uniqueIps",
                 COUNT(*) FILTER (WHERE login_success IS TRUE)::bigint AS "successfulLogins",
                 MAX(started_at) AS "lastSeen"
          FROM sessions
          WHERE started_at >= ${cutoff}
        `),
        fastify.prisma.$queryRaw<WebOverviewRow[]>(Prisma.sql`
          SELECT COUNT(*)::bigint AS hits,
                 COUNT(DISTINCT src_ip)::bigint AS "uniqueIps",
                 MAX(timestamp) AS "lastSeen"
          FROM web_hits
          WHERE timestamp >= ${cutoff}
        `),
        fastify.prisma.$queryRaw<WebTopAttackRow[]>(Prisma.sql`
          SELECT attack_type AS "attackType"
          FROM web_hits
          WHERE timestamp >= ${cutoff}
          GROUP BY attack_type
          ORDER BY COUNT(*) DESC
          LIMIT 1
        `),
        fastify.prisma.$queryRaw<ProtocolOverviewRow[]>(Prisma.sql`
          SELECT protocol,
                 COUNT(*)::bigint AS count,
                 COUNT(DISTINCT src_ip)::bigint AS "uniqueIps",
                 COUNT(*) FILTER (WHERE event_type = 'auth')::bigint AS "authAttempts",
                 MAX(timestamp) AS "lastSeen"
          FROM protocol_hits
          WHERE timestamp >= ${cutoff}
          GROUP BY protocol
          ORDER BY COUNT(*) DESC
        `),
      ])

      const ssh = sshRows[0] ?? { sessions: 0n, uniqueIps: 0n, successfulLogins: 0n, lastSeen: null }
      const web = webRows[0] ?? { hits: 0n, uniqueIps: 0n, lastSeen: null }
      const sshCount = Number(ssh.sessions)
      const webCount = Number(web.hits)
      const protocolCount = protocolRows.reduce((sum, r) => sum + Number(r.count), 0)
      const activeSources =
        (sshCount > 0 ? 1 : 0) +
        (webCount > 0 ? 1 : 0) +
        protocolRows.filter(r => Number(r.count) > 0).length

      return {
        ssh: { sessions: sshCount, uniqueIps: Number(ssh.uniqueIps), successfulLogins: Number(ssh.successfulLogins), lastSeen: ssh.lastSeen?.toISOString() ?? null },
        web: { hits: webCount, uniqueIps: Number(web.uniqueIps), topAttackType: webTopAttackRows[0]?.attackType ?? null, lastSeen: web.lastSeen?.toISOString() ?? null },
        protocols: protocolRows.map(r => ({ protocol: r.protocol, count: Number(r.count), uniqueIps: Number(r.uniqueIps), authAttempts: Number(r.authAttempts), lastSeen: r.lastSeen?.toISOString() ?? null })),
        totals: { events: sshCount + webCount + protocolCount, activeSources },
      }
    })
  )

  fastify.get('/stats/cross-sensor-timeline', async (request) => {
    const query = request.query as Record<string, string | undefined>
    const range = query.range === 'week' || query.range === 'month' ? query.range : 'day'
    const timezone = query.timezone || 'UTC'
    const cacheKey = `stats:cross-sensor-timeline:${range}:${timezone.replace(/\//g, '_')}`

    return withCache(fastify.cache, cacheKey, TIMELINE_TTL, async () => {
      const now = new Date()
      const endDate = new Date(now)
      const startDate = new Date(now)
      if (range === 'week') startDate.setDate(startDate.getDate() - 6)
      else if (range === 'month') startDate.setDate(startDate.getDate() - 29)
      else startDate.setHours(startDate.getHours() - 23)

      const truncUnit = range === 'day' ? 'hour' : 'day'
      const interval = range === 'day' ? "interval '1 hour'" : "interval '1 day'"
      const fmt = range === 'day' ? 'YYYY-MM-DD HH24:MI' : 'YYYY-MM-DD'
      const lbl = range === 'day' ? 'HH24:MI' : 'DD/MM'

      interface BaseBucket { bucketStart: string; label: string; count: number }
      interface ProtoBucket { protocol: string; bucketStart: string; label: string; count: number }

      const [sshRows, webRows, protoRows] = await Promise.all([
        fastify.prisma.$queryRaw<BaseBucket[]>(Prisma.sql`
          WITH bounds AS (
            SELECT date_trunc(${truncUnit}, timezone(${timezone}, ${startDate}::timestamptz)) AS s,
                   date_trunc(${truncUnit}, timezone(${timezone}, ${endDate}::timestamptz))   AS e
          ),
          series AS (SELECT generate_series(s, e, ${Prisma.raw(interval)}) AS b FROM bounds),
          counts AS (
            SELECT date_trunc(${truncUnit}, timezone(${timezone}, started_at::timestamptz)) AS b, COUNT(*)::int AS count
            FROM sessions WHERE started_at >= ${startDate} AND started_at <= ${endDate} GROUP BY 1
          )
          SELECT to_char(series.b, ${fmt}) AS "bucketStart", to_char(series.b, ${lbl}) AS label,
                 COALESCE(counts.count, 0)::int AS count
          FROM series LEFT JOIN counts USING (b) ORDER BY series.b
        `),
        fastify.prisma.$queryRaw<BaseBucket[]>(Prisma.sql`
          WITH bounds AS (
            SELECT date_trunc(${truncUnit}, timezone(${timezone}, ${startDate}::timestamptz)) AS s,
                   date_trunc(${truncUnit}, timezone(${timezone}, ${endDate}::timestamptz))   AS e
          ),
          series AS (SELECT generate_series(s, e, ${Prisma.raw(interval)}) AS b FROM bounds),
          counts AS (
            SELECT date_trunc(${truncUnit}, timezone(${timezone}, timestamp::timestamptz)) AS b, COUNT(*)::int AS count
            FROM web_hits WHERE timestamp >= ${startDate} AND timestamp <= ${endDate} GROUP BY 1
          )
          SELECT to_char(series.b, ${fmt}) AS "bucketStart", to_char(series.b, ${lbl}) AS label,
                 COALESCE(counts.count, 0)::int AS count
          FROM series LEFT JOIN counts USING (b) ORDER BY series.b
        `),
        fastify.prisma.$queryRaw<ProtoBucket[]>(Prisma.sql`
          SELECT protocol,
                 to_char(date_trunc(${truncUnit}, timezone(${timezone}, timestamp::timestamptz)), ${fmt}) AS "bucketStart",
                 to_char(date_trunc(${truncUnit}, timezone(${timezone}, timestamp::timestamptz)), ${lbl}) AS label,
                 COUNT(*)::int AS count
          FROM protocol_hits WHERE timestamp >= ${startDate} AND timestamp <= ${endDate}
          GROUP BY 1, 2, 3 ORDER BY 3
        `),
      ])

      type BucketEntry = Record<string, number | string>
      const map = new Map<string, BucketEntry>()
      for (const r of sshRows) map.set(r.bucketStart, { label: r.label, ssh: r.count, web: 0 })
      for (const r of webRows) {
        const e = map.get(r.bucketStart)
        if (e) (e as Record<string, number>).web = r.count
      }
      const activeProtocols = new Set<string>()
      for (const r of protoRows) {
        activeProtocols.add(r.protocol)
        const e = map.get(r.bucketStart)
        if (e) (e as Record<string, number>)[r.protocol] = ((e as Record<string, number>)[r.protocol] ?? 0) + r.count
      }
      const protoList = Array.from(activeProtocols)
      for (const e of map.values()) {
        for (const p of protoList) if ((e as Record<string, number>)[p] === undefined) (e as Record<string, number>)[p] = 0
      }

      return { buckets: Array.from(map.values()), activeProtocols: protoList }
    })
  })

  fastify.get('/stats/geo', () =>
    withCache(fastify.cache, 'stats:geo', GEO_TTL, () =>
      fastify.prisma.$queryRaw<{ srcIp: string; loginSuccess: boolean | null }[]>(Prisma.sql`
        SELECT src_ip AS "srcIp", BOOL_OR(login_success IS TRUE) AS "loginSuccess"
        FROM sessions GROUP BY src_ip
      `)
    )
  )

  fastify.get('/stats/session-commands', async (request) => {
    const { limit = '500' } = request.query as Record<string, string>
    const events = await fastify.prisma.event.findMany({
      where: { eventType: 'command.input', command: { not: null } },
      select: { sessionId: true, command: true },
      take: Math.min(Number(limit), 5000),
      orderBy: { eventTs: 'asc' },
    })
    const result: Record<string, string[]> = {}
    for (const e of events) {
      if (!e.command) continue
      if (!result[e.sessionId]) result[e.sessionId] = []
      result[e.sessionId].push(e.command)
    }
    return result
  })

  fastify.get('/stats/heatmap', async (request) => {
    const query = request.query as Record<string, string | undefined>
    const timezone = query.timezone || 'UTC'
    const days = Math.min(Math.max(parseInt(query.days || '90', 10), 1), 365)
    const cacheKey = `stats:heatmap:${days}:${timezone.replace(/\//g, '_')}`

    return withCache(fastify.cache, cacheKey, 1200, async () => {
      interface HeatmapRow { dow: number; hour: number; count: bigint }
      const rows = await fastify.prisma.$queryRaw<HeatmapRow[]>(Prisma.sql`
        SELECT EXTRACT(DOW  FROM started_at AT TIME ZONE ${timezone})::int AS dow,
               EXTRACT(HOUR FROM started_at AT TIME ZONE ${timezone})::int AS hour,
               COUNT(*)::bigint AS count
        FROM sessions WHERE started_at >= NOW() - (${days} || ' days')::interval
        GROUP BY dow, hour ORDER BY dow, hour
      `)
      const cells = rows.map(r => ({ dow: r.dow, hour: r.hour, count: Number(r.count) }))
      const maxCount = cells.reduce((m, c) => Math.max(m, c.count), 0)
      const totalSessions = cells.reduce((s, c) => s + c.count, 0)
      const hourTotals = Array.from({ length: 24 }, (_, h) =>
        cells.filter(c => c.hour === h).reduce((s, c) => s + c.count, 0)
      )
      return { cells, maxCount, totalSessions, hourTotals, days }
    })
  })
}
