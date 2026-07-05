import type { FastifyInstance } from 'fastify'
import { withCache } from '../../../lib/cache-helper.js'
import { parseSensorScope } from '../../../lib/sensor-scope.js'
import { BotRatioRepository } from '../stats.repository.js'

const BOT_RATIO_TTL = 300

export async function botRatioRoute(fastify: FastifyInstance) {
  const repo = new BotRatioRepository(fastify.prismaRead)

  fastify.get('/stats/bot-ratio', (request) => {
    const scope = parseSensorScope(request.query as Record<string, unknown>)
    return withCache(fastify.cache, `stats:bot-ratio:${scope.cacheSuffix}`, BOT_RATIO_TTL, async () => {
      const [row] = await repo.getBotRatio(scope)

      const bot     = Number(row?.bot     ?? 0n)
      const human   = Number(row?.human   ?? 0n)
      const unknown = Number(row?.unknown ?? 0n)
      const total   = Number(row?.total   ?? 0n)

      const pct = (n: number) => total > 0 ? Number(((n / total) * 100).toFixed(1)) : null

      return { bot, human, unknown, total, botPct: pct(bot), humanPct: pct(human), unknownPct: pct(unknown) }
    })
  })
}
