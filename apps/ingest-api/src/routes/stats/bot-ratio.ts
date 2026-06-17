import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { withCache } from '../../lib/cache-helper.js'
import { parseSensorScope } from '../../lib/sensor-scope.js'

const BOT_RATIO_TTL = 300

export async function botRatioRoute(fastify: FastifyInstance) {
  fastify.get('/stats/bot-ratio', (request) => {
    const scope = parseSensorScope(request.query as Record<string, unknown>)
    return withCache(fastify.cache, `stats:bot-ratio:${scope.cacheSuffix}`, BOT_RATIO_TTL, async () => {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

      type Row = { bot: bigint; human: bigint; unknown: bigint; total: bigint }
      const [row] = await fastify.prismaRead.$queryRaw<Row[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE session_type = 'bot')     ::bigint AS bot,
          COUNT(*) FILTER (WHERE session_type = 'human')   ::bigint AS human,
          COUNT(*) FILTER (WHERE session_type = 'unknown' OR session_type IS NULL)::bigint AS unknown,
          COUNT(*)                                          ::bigint AS total
        FROM sessions
        WHERE started_at >= ${cutoff} ${scope.cond('sensor_id')}
      `)

      const bot     = Number(row?.bot     ?? 0n)
      const human   = Number(row?.human   ?? 0n)
      const unknown = Number(row?.unknown ?? 0n)
      const total   = Number(row?.total   ?? 0n)

      const pct = (n: number) => total > 0 ? Number(((n / total) * 100).toFixed(1)) : null

      return { bot, human, unknown, total, botPct: pct(bot), humanPct: pct(human), unknownPct: pct(unknown) }
    })
  })
}
