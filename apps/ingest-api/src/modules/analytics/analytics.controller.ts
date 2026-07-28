import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AnalyticsService, type TrendRange } from './analytics.service.js'
import { parseClickHouseScope } from '../../lib/clickhouse-scope.js'

const trendsQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
  protocol: z.string().min(1).optional(),
})

export async function analyticsRoutes(fastify: FastifyInstance) {
  const svc = new AnalyticsService(fastify.clickhouse)

  // 503, not a silent fallback to Postgres — a single-host deploy without
  // ClickHouse should tell the UI "unavailable", not run a query that could
  // take minutes against the wrong database. See ANALYTICS_MODULE.md gating.
  fastify.get('/analytics/trends', async (request, reply) => {
    if (!svc.enabled) return reply.status(503).send({ error: 'analytics_unavailable' })

    const q = trendsQuerySchema.parse(request.query)
    const scope = parseClickHouseScope(request.query as Record<string, unknown>)
    try {
      const data = await svc.getTrends(fastify.cache, q.range as TrendRange, q.protocol ?? null, scope)
      return reply.send({ range: q.range, protocol: q.protocol ?? null, data })
    } catch (err) {
      // ClickHouse configured but unreachable/erroring right now (e.g. still
      // starting up — plugins/clickhouse.ts no longer gates on a boot ping).
      // Surface the same 503 the UI already handles, not a generic 500.
      request.log.warn({ err }, 'ClickHouse query failed')
      return reply.status(503).send({ error: 'analytics_unavailable' })
    }
  })
}
