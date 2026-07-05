import type { FastifyInstance } from 'fastify'
import { sampleContainerStatsLive } from '../../lib/docker-stats.js'
import { withCache } from '../../lib/cache-helper.js'
import { parseMeminfo, parseLoadAvg, parseUptime, parseRedisInfo } from '../../lib/system-metrics.js'
import { MonitoringService, type Range } from './monitoring.service.js'

const VALID_RANGES = new Set(['24h', '7d', '30d'])

export async function monitoringRoutes(fastify: FastifyInstance) {
  const svc = new MonitoringService(fastify.prisma)

  fastify.get('/monitoring/system', async () => {
    return withCache(fastify.cache, 'monitoring:system', 30, async () => {
      const [memory, loadAvg, uptime, redisRaw] = await Promise.all([
        Promise.resolve(parseMeminfo()),
        Promise.resolve(parseLoadAvg()),
        Promise.resolve(parseUptime()),
        fastify.cache?.info() ?? Promise.resolve(null),
      ])
      return {
        system: { uptime, loadAvg, memory },
        redis:  redisRaw ? parseRedisInfo(redisRaw) : { connected: false },
      }
    })
  })

  fastify.get('/monitoring/history', async (request) => {
    const { range = '24h' } = request.query as { range?: string }
    const r = (VALID_RANGES.has(range) ? range : '24h') as Range
    return withCache(fastify.cache, `monitoring:history:${r}`, 120, () => svc.getSystemHistory(r))
  })

  fastify.get('/monitoring/containers/stats', async () => {
    return withCache(fastify.cache, 'monitoring:containers:stats', 60, () => sampleContainerStatsLive())
  })

  fastify.get('/monitoring/containers/history', async (request) => {
    const { range = '24h' } = request.query as { range?: string }
    const r = (VALID_RANGES.has(range) ? range : '24h') as Range
    return withCache(fastify.cache, `monitoring:containers:history:${r}`, 120, () => svc.getContainerHistory(r))
  })
}
