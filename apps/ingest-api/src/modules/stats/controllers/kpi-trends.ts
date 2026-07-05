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
        sshCur, sshPrev, sshSpark,
        webCur, webPrev, webSpark,
        protoCur, protoPrev, protoSpark,
        ipCur, ipPrev, ipSpark,
        protoBreakCur, protoBreakPrev, protoBreakSpark,
      ] = await repo.getKpiTrends(scope)

      const num = (rows: Array<{ count: bigint }>) => Number(rows[0]?.count ?? 0n)
      const spark = (rows: Array<{ count: number }>) => rows.map((r) => r.count)

      const metric = (cur: number, prev: number, s: number[]): MetricTrend => ({
        current: cur,
        previous: prev,
        deltaPct: deltaPct(cur, prev),
        spark: s,
      })

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
  })
}
