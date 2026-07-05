import type { FastifyInstance } from 'fastify'
import { withCache } from '../../lib/cache-helper.js'
import { parseSensorScope } from '../../lib/sensor-scope.js'
import { NoveltyRepository } from '../../modules/stats/stats.repository.js'

const NOVELTY_TTL = 300
const DEFAULT_HOURS = 24

export async function noveltyRoute(fastify: FastifyInstance) {
  const repo = new NoveltyRepository(fastify.prismaRead)

  fastify.get('/stats/novelty', (request) => {
    const q = request.query as Record<string, string | undefined>
    const hours = Math.min(Math.max(Number(q.hours) || DEFAULT_HOURS, 1), 168)
    const scope = parseSensorScope(request.query as Record<string, unknown>)
    return withCache(fastify.cache, `stats:novelty:${hours}:${scope.cacheSuffix}`, NOVELTY_TTL, async () => {
      const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000)
      const [newIps, newCredPairs, newWebPaths, newCommands, topNewIps] = await repo.getNoveltyStats(windowStart, scope)
      return {
        windowHours: hours,
        newIps: Number(newIps[0]?.count ?? 0n),
        newCredPairs: Number(newCredPairs[0]?.count ?? 0n),
        newWebPaths: Number(newWebPaths[0]?.count ?? 0n),
        newCommands: Number(newCommands[0]?.count ?? 0n),
        topNewIps: topNewIps.map((r) => ({ srcIp: r.srcIp, hits: Number(r.hits) })),
      }
    })
  })
}
