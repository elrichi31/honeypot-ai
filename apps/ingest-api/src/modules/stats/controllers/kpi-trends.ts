import type { FastifyInstance } from 'fastify'
import { withCache } from '../../../lib/cache-helper.js'
import { parseSensorScope } from '../../../lib/sensor-scope.js'
import { KpiRepository } from '../stats.repository.js'

const KPI_TRENDS_TTL = 600

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

export async function kpiTrendsRoute(fastify: FastifyInstance) {
  const repo = new KpiRepository(fastify.prismaRead)

  fastify.get('/stats/kpi-trends', (request) => {
    const scope = parseSensorScope(request.query as Record<string, unknown>)
    return withCache(fastify.cache, `stats:kpi-trends:${scope.cacheSuffix}`, KPI_TRENDS_TTL, async () => {
      const [
        sshCounts, sshSpark,
        webCounts, webSpark,
        protoCounts, protoSpark,
        ipCounts, ipSpark,
        protoBreakCounts, protoBreakSpark,
      ] = await repo.getKpiTrends(scope)

      const cur = (rows: Array<{ curCount: bigint }>) => Number(rows[0]?.curCount ?? 0n)
      const prev = (rows: Array<{ prevCount: bigint }>) => Number(rows[0]?.prevCount ?? 0n)
      const spark = (rows: Array<{ count: number }>) => rows.map((r) => r.count)

      const metric = (c: number, p: number, s: number[]): MetricTrend => ({
        current: c,
        previous: p,
        deltaPct: deltaPct(c, p),
        spark: s,
      })

      const sshC = cur(sshCounts), sshP = prev(sshCounts)
      const webC = cur(webCounts), webP = prev(webCounts)
      const protoC = cur(protoCounts), protoP = prev(protoCounts)
      const eventsCur = sshC + webC + protoC
      const eventsPrev = sshP + webP + protoP
      const sumSpark = (a: number[], b: number[], c: number[]) =>
        a.map((v, i) => v + (b[i] ?? 0) + (c[i] ?? 0))

      const protoSparkMap = new Map<string, number[]>()
      for (const r of protoBreakSpark) {
        if (!protoSparkMap.has(r.protocol)) protoSparkMap.set(r.protocol, [])
        protoSparkMap.get(r.protocol)!.push(r.count)
      }
      const protocols: Record<string, MetricTrend> = {}
      for (const r of protoBreakCounts) {
        protocols[r.protocol] = metric(Number(r.curCount), Number(r.prevCount), protoSparkMap.get(r.protocol) ?? [])
      }

      return {
        events: metric(eventsCur, eventsPrev, sumSpark(spark(sshSpark), spark(webSpark), spark(protoSpark))),
        sshSessions: metric(sshC, sshP, spark(sshSpark)),
        webHits: metric(webC, webP, spark(webSpark)),
        uniqueIps: metric(cur(ipCounts), prev(ipCounts), spark(ipSpark)),
        protocols,
      }
    })
  })
}
