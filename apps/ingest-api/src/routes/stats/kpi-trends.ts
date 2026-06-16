import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { withCache } from '../../lib/cache-helper.js'

const KPI_TRENDS_TTL = 300

interface MetricTrend {
  current: number
  previous: number
  deltaPct: number | null
  spark: number[]
}

function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

/**
 * Builds the 24-bucket hourly sparkline for the last 24h. Reuses the
 * bounds/series/counts pattern from cross-sensor-timeline so empty hours
 * render as 0 instead of being dropped.
 */
function sparkSql(table: string, tsCol: string, start: Date, end: Date) {
  return Prisma.sql`
    WITH bounds AS (
      SELECT date_trunc('hour', ${start}::timestamptz) AS s,
             date_trunc('hour', ${end}::timestamptz)   AS e
    ),
    series AS (SELECT generate_series(s, e, interval '1 hour') AS b FROM bounds),
    counts AS (
      SELECT date_trunc('hour', ${Prisma.raw(tsCol)}::timestamptz) AS b, COUNT(*)::int AS count
      FROM ${Prisma.raw(table)}
      WHERE ${Prisma.raw(tsCol)} >= ${start} AND ${Prisma.raw(tsCol)} <= ${end}
      GROUP BY 1
    )
    SELECT COALESCE(counts.count, 0)::int AS count
    FROM series LEFT JOIN counts USING (b) ORDER BY series.b
  `
}

export async function kpiTrendsRoute(fastify: FastifyInstance) {
  fastify.get('/stats/kpi-trends', () =>
    withCache(fastify.cache, 'stats:kpi-trends', KPI_TRENDS_TTL, async () => {
      const now = new Date()
      const curStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const prevStart = new Date(now.getTime() - 48 * 60 * 60 * 1000)

      type CountRow = { count: bigint }
      type SparkRow = { count: number }

      const windowCount = (table: string, tsCol: string, start: Date, end: Date) =>
        fastify.prismaRead.$queryRaw<CountRow[]>(Prisma.sql`
          SELECT COUNT(*)::bigint AS count FROM ${Prisma.raw(table)}
          WHERE ${Prisma.raw(tsCol)} >= ${start} AND ${Prisma.raw(tsCol)} <= ${end}
        `)

      // Unique IPs across all three sources in a window.
      const uniqueIpCount = (start: Date, end: Date) =>
        fastify.prismaRead.$queryRaw<CountRow[]>(Prisma.sql`
          SELECT COUNT(DISTINCT src_ip)::bigint AS count FROM (
            SELECT src_ip FROM sessions      WHERE started_at >= ${start} AND started_at <= ${end}
            UNION ALL
            SELECT src_ip FROM web_hits      WHERE timestamp  >= ${start} AND timestamp  <= ${end}
            UNION ALL
            SELECT src_ip FROM protocol_hits WHERE timestamp  >= ${start} AND timestamp  <= ${end}
          ) u
        `)

      const uniqueIpSpark = (start: Date, end: Date) =>
        fastify.prismaRead.$queryRaw<SparkRow[]>(Prisma.sql`
          WITH bounds AS (
            SELECT date_trunc('hour', ${start}::timestamptz) AS s,
                   date_trunc('hour', ${end}::timestamptz)   AS e
          ),
          series AS (SELECT generate_series(s, e, interval '1 hour') AS b FROM bounds),
          rows AS (
            SELECT date_trunc('hour', started_at::timestamptz) AS b, src_ip FROM sessions
              WHERE started_at >= ${start} AND started_at <= ${end}
            UNION ALL
            SELECT date_trunc('hour', timestamp::timestamptz) AS b, src_ip FROM web_hits
              WHERE timestamp >= ${start} AND timestamp <= ${end}
            UNION ALL
            SELECT date_trunc('hour', timestamp::timestamptz) AS b, src_ip FROM protocol_hits
              WHERE timestamp >= ${start} AND timestamp <= ${end}
          ),
          counts AS (SELECT b, COUNT(DISTINCT src_ip)::int AS count FROM rows GROUP BY b)
          SELECT COALESCE(counts.count, 0)::int AS count
          FROM series LEFT JOIN counts USING (b) ORDER BY series.b
        `)

      type ProtoCountRow = { protocol: string; count: bigint }
      type ProtoSparkRow = { protocol: string; count: number }

      const [
        sshCur, sshPrev, sshSpark,
        webCur, webPrev, webSpark,
        protoCur, protoPrev, protoSpark,
        ipCur, ipPrev, ipSpark,
        protoBreakCur, protoBreakPrev, protoBreakSpark,
      ] = await Promise.all([
        windowCount('sessions', 'started_at', curStart, now),
        windowCount('sessions', 'started_at', prevStart, curStart),
        fastify.prismaRead.$queryRaw<SparkRow[]>(sparkSql('sessions', 'started_at', curStart, now)),

        windowCount('web_hits', 'timestamp', curStart, now),
        windowCount('web_hits', 'timestamp', prevStart, curStart),
        fastify.prismaRead.$queryRaw<SparkRow[]>(sparkSql('web_hits', 'timestamp', curStart, now)),

        windowCount('protocol_hits', 'timestamp', curStart, now),
        windowCount('protocol_hits', 'timestamp', prevStart, curStart),
        fastify.prismaRead.$queryRaw<SparkRow[]>(sparkSql('protocol_hits', 'timestamp', curStart, now)),

        uniqueIpCount(curStart, now),
        uniqueIpCount(prevStart, curStart),
        uniqueIpSpark(curStart, now),

        fastify.prismaRead.$queryRaw<ProtoCountRow[]>(Prisma.sql`
          SELECT protocol, COUNT(*)::bigint AS count FROM protocol_hits
          WHERE timestamp >= ${curStart} AND timestamp <= ${now} GROUP BY protocol
        `),
        fastify.prismaRead.$queryRaw<ProtoCountRow[]>(Prisma.sql`
          SELECT protocol, COUNT(*)::bigint AS count FROM protocol_hits
          WHERE timestamp >= ${prevStart} AND timestamp <= ${curStart} GROUP BY protocol
        `),
        fastify.prismaRead.$queryRaw<ProtoSparkRow[]>(Prisma.sql`
          SELECT protocol, COALESCE(counts.count, 0)::int AS count
          FROM (
            SELECT DISTINCT protocol FROM protocol_hits
            WHERE timestamp >= ${prevStart} AND timestamp <= ${now}
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
            FROM protocol_hits WHERE timestamp >= ${curStart} AND timestamp <= ${now}
            GROUP BY 1, 2
          ) counts USING (protocol, b)
          ORDER BY protos.protocol, hrs.b
        `),
      ])

      const num = (rows: CountRow[]) => Number(rows[0]?.count ?? 0n)
      const spark = (rows: SparkRow[]) => rows.map((r) => r.count)

      const metric = (cur: number, prev: number, s: number[]): MetricTrend => ({
        current: cur,
        previous: prev,
        deltaPct: deltaPct(cur, prev),
        spark: s,
      })

      // "events" = combined activity across all three sources.
      const sshC = num(sshCur), sshP = num(sshPrev)
      const webC = num(webCur), webP = num(webPrev)
      const protoC = num(protoCur), protoP = num(protoPrev)
      const eventsCur = sshC + webC + protoC
      const eventsPrev = sshP + webP + protoP
      const sumSpark = (a: number[], b: number[], c: number[]) =>
        a.map((v, i) => v + (b[i] ?? 0) + (c[i] ?? 0))

      const protoCurMap  = new Map(protoBreakCur.map(r  => [r.protocol, Number(r.count)]))
      const protoPrevMap = new Map(protoBreakPrev.map(r => [r.protocol, Number(r.count)]))
      const protoSparkMap = new Map<string, number[]>()
      for (const r of protoBreakSpark) {
        if (!protoSparkMap.has(r.protocol)) protoSparkMap.set(r.protocol, [])
        protoSparkMap.get(r.protocol)!.push(r.count)
      }
      const protocols: Record<string, MetricTrend> = {}
      for (const p of new Set([...protoCurMap.keys(), ...protoPrevMap.keys()])) {
        protocols[p] = metric(
          protoCurMap.get(p)  ?? 0,
          protoPrevMap.get(p) ?? 0,
          protoSparkMap.get(p) ?? [],
        )
      }

      return {
        events: metric(eventsCur, eventsPrev, sumSpark(spark(sshSpark), spark(webSpark), spark(protoSpark))),
        sshSessions: metric(sshC, sshP, spark(sshSpark)),
        webHits: metric(webC, webP, spark(webSpark)),
        uniqueIps: metric(num(ipCur), num(ipPrev), spark(ipSpark)),
        protocols,
      }
    })
  )
}
