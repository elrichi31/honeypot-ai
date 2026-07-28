import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  AnalyticsService,
  CAMPAIGN_MINIMUM_ATTEMPTS,
  CAMPAIGN_WINDOW_MINUTES,
} from './analytics.service.js'
import { AnalyticsAttackerService } from './analytics-attacker.service.js'
import { AnalyticsSuricataService } from './analytics-suricata.service.js'
import { AnalyticsComparisonService } from './analytics-comparison.service.js'
import { parseClickHouseScope } from '../../lib/clickhouse-scope.js'
import { isInternalIp } from '../../lib/internal-ip.js'
import { ensureControlApiToken, getControlActor } from '../../lib/control-auth.js'

const rangeSchema = z.enum(['7d', '30d', '90d', '1y'])
const trendsQuerySchema = z.object({
  range: rangeSchema.default('30d'),
  protocol: z.string().min(1).optional(),
})
const topCombosQuerySchema = z.object({
  range: rangeSchema.default('30d'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
const campaignsQuerySchema = z.object({
  range: rangeSchema.default('30d'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})
const successRateQuerySchema = z.object({
  range: rangeSchema.default('30d'),
})
const attackerParamsSchema = z.object({
  ip: z.string().ip(),
})
const attackerTimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  before: z.string().datetime({ offset: true }).optional(),
})
const suricataTrendsQuerySchema = z.object({
  range: rangeSchema.default('90d'),
  groupBy: z.enum(['signature', 'category']).default('signature'),
  limit: z.coerce.number().int().min(1).max(25).default(10),
})
const comparisonQuerySchema = z.object({
  range: rangeSchema.default('30d'),
})
const reportSummaryQuerySchema = z.object({
  range: rangeSchema.default('30d'),
  credentialLimit: z.coerce.number().int().min(1).max(50).default(10),
})

function parseAnalyticsQuery<T extends z.ZodTypeAny>(
  schema: T,
  request: FastifyRequest,
  reply: FastifyReply,
): z.infer<T> | undefined {
  const parsed = schema.safeParse(request.query)
  if (parsed.success) return parsed.data

  reply.status(400).send({
    error: 'Invalid query params',
    details: parsed.error.flatten().fieldErrors,
  })
  return undefined
}

async function sendAnalyticsResponse<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  operation: () => Promise<T>,
) {
  try {
    return reply.send(await operation())
  } catch (err) {
    request.log.warn({ err }, 'ClickHouse query failed')
    return reply.status(503).send({ error: 'analytics_unavailable' })
  }
}

export async function analyticsRoutes(fastify: FastifyInstance) {
  const svc = new AnalyticsService(fastify.clickhouse)
  const attackerSvc = new AnalyticsAttackerService(fastify.clickhouse)
  const suricataSvc = new AnalyticsSuricataService(fastify.clickhouse)
  const comparisonSvc = new AnalyticsComparisonService(fastify.clickhouse, fastify.prismaRead)

  // 503, not a silent fallback to Postgres — a single-host deploy without
  // ClickHouse should tell the UI "unavailable", not run a query that could
  // take minutes against the wrong database. See ANALYTICS_MODULE.md gating.
  fastify.get('/analytics/trends', async (request, reply) => {
    if (!svc.enabled) return reply.status(503).send({ error: 'analytics_unavailable' })

    const q = parseAnalyticsQuery(trendsQuerySchema, request, reply)
    if (!q) return reply
    const scope = parseClickHouseScope(request.query as Record<string, unknown>)
    return sendAnalyticsResponse(request, reply, async () => {
      const data = await svc.getTrends(fastify.cache, q.range, q.protocol ?? null, scope)
      return { range: q.range, protocol: q.protocol ?? null, data }
    })
  })

  fastify.get('/analytics/credentials/top-combos', async (request, reply) => {
    if (!svc.enabled) return reply.status(503).send({ error: 'analytics_unavailable' })

    const q = parseAnalyticsQuery(topCombosQuerySchema, request, reply)
    if (!q) return reply
    const scope = parseClickHouseScope(request.query as Record<string, unknown>)
    return sendAnalyticsResponse(request, reply, async () => ({
      range: q.range,
      limit: q.limit,
      data: await svc.getCredentialTopCombos(fastify.cache, q.range, q.limit, scope),
    }))
  })

  fastify.get('/analytics/credentials/campaigns', async (request, reply) => {
    if (!svc.enabled) return reply.status(503).send({ error: 'analytics_unavailable' })

    const q = parseAnalyticsQuery(campaignsQuerySchema, request, reply)
    if (!q) return reply
    const scope = parseClickHouseScope(request.query as Record<string, unknown>)
    return sendAnalyticsResponse(request, reply, async () => ({
      range: q.range,
      limit: q.limit,
      windowMinutes: CAMPAIGN_WINDOW_MINUTES,
      minimumAttempts: CAMPAIGN_MINIMUM_ATTEMPTS,
      data: await svc.getCredentialCampaigns(fastify.cache, q.range, q.limit, scope),
    }))
  })

  fastify.get('/analytics/credentials/success-rate', async (request, reply) => {
    if (!svc.enabled) return reply.status(503).send({ error: 'analytics_unavailable' })

    const q = parseAnalyticsQuery(successRateQuerySchema, request, reply)
    if (!q) return reply
    const scope = parseClickHouseScope(request.query as Record<string, unknown>)
    return sendAnalyticsResponse(request, reply, async () => ({
      range: q.range,
      source: 'cowrie',
      data: await svc.getCredentialSuccessRate(fastify.cache, q.range, scope),
    }))
  })

  fastify.get('/analytics/attacker/:ip/timeline', async (request, reply) => {
    if (!attackerSvc.enabled) return reply.status(503).send({ error: 'analytics_unavailable' })

    const parsedParams = attackerParamsSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: 'Invalid path params',
        details: parsedParams.error.flatten().fieldErrors,
      })
    }
    if (isInternalIp(parsedParams.data.ip)) {
      return reply.status(404).send({ error: 'Threat not found' })
    }

    const q = parseAnalyticsQuery(attackerTimelineQuerySchema, request, reply)
    if (!q) return reply
    const scope = parseClickHouseScope(request.query as Record<string, unknown>)
    return sendAnalyticsResponse(request, reply, async () => ({
      ip: parsedParams.data.ip,
      limit: q.limit,
      before: q.before ?? null,
      ...(await attackerSvc.getTimeline(
        fastify.cache,
        parsedParams.data.ip,
        q.limit,
        q.before,
        scope,
      )),
    }))
  })

  fastify.get('/analytics/suricata-trends', async (request, reply) => {
    if (!suricataSvc.enabled) return reply.status(503).send({ error: 'analytics_unavailable' })

    const q = parseAnalyticsQuery(suricataTrendsQuerySchema, request, reply)
    if (!q) return reply
    const scope = parseClickHouseScope(request.query as Record<string, unknown>)
    return sendAnalyticsResponse(request, reply, async () => ({
      range: q.range,
      groupBy: q.groupBy,
      limit: q.limit,
      ...(await suricataSvc.getTrends(
        fastify.cache,
        q.range,
        q.groupBy,
        q.limit,
        scope,
      )),
    }))
  })

  fastify.get('/analytics/comparison', async (request, reply) => {
    if (!ensureControlApiToken(request, reply)) return
    const actor = getControlActor(request)
    if (!actor) return reply.status(401).send({ error: 'Invalid actor headers' })
    if (!actor.isSuperadmin || !actor.isGlobal) {
      return reply.status(403).send({ error: 'Superadmin global scope required' })
    }
    if (!comparisonSvc.enabled) {
      return reply.status(503).send({ error: 'analytics_unavailable' })
    }

    const q = parseAnalyticsQuery(comparisonQuerySchema, request, reply)
    if (!q) return reply
    const scope = parseClickHouseScope(request.query as Record<string, unknown>)
    return sendAnalyticsResponse(request, reply, async () => ({
      range: q.range,
      ...(await comparisonSvc.getComparison(fastify.cache, q.range, scope)),
    }))
  })

  fastify.get('/analytics/report-summary', async (request, reply) => {
    if (!svc.enabled) return reply.status(503).send({ error: 'analytics_unavailable' })

    const q = parseAnalyticsQuery(reportSummaryQuerySchema, request, reply)
    if (!q) return reply
    const scope = parseClickHouseScope(request.query as Record<string, unknown>)
    return sendAnalyticsResponse(request, reply, async () => ({
      range: q.range,
      credentialLimit: q.credentialLimit,
      ...(await svc.getReportSummary(
        fastify.cache,
        q.range,
        q.credentialLimit,
        scope,
      )),
    }))
  })
}
