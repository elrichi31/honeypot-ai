import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../../lib/ingest-auth.js'
import { eventBus } from '../../lib/event-bus.js'
import { lookupGeo } from '../../lib/geo.js'
import { scheduleThreatAlert, evaluateCanaryAlert } from '../../lib/threat-alerts.js'
import { forwardClientEventBySensorId } from '../../lib/client-forward.js'
import { lakeProducer, LAKE_TOPICS } from '../../lib/lake-producer.js'
import { basePaginationSchema, getPagination } from '../../lib/pagination.js'
import { webHitSchema, normalizeHeaders, parseWebHitBatch } from '../../lib/web-normalize.js'
import { WebService, resolveSensorScope } from './web.service.js'
import { isInternalIp } from '../../lib/internal-ip.js'
import { parseSensorScope } from '../../lib/sensor-scope.js'

const webHitsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(500).default(100),
  offset: z.coerce.number().min(0).default(0),
  attackType: z.string().optional(),
  srcIp: z.string().optional(),
})

const ATTACK_TYPES = ['sqli', 'xss', 'lfi', 'rfi', 'cmdi', 'log4shell', 'ssti', 'xxe', 'deserialization', 'scanner', 'info_disclosure', 'recon'] as const

const RANGES = ['24h', '7d', '30d', 'all'] as const

const byIpQuerySchema = basePaginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  attackType: z.enum(ATTACK_TYPES).optional(),
  range: z.enum(RANGES).optional(),
  clientSlug: z.string().trim().min(1).optional(),
  sensorId: z.string().trim().min(1).optional(),
  sortBy: z.enum(['totalHits', 'lastSeen', 'firstSeen']).default('totalHits'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

const statsQuerySchema = z.object({
  range: z.enum(RANGES).optional(),
  clientSlug: z.string().trim().min(1).optional(),
  sensorId: z.string().trim().min(1).optional(),
})

const burstsQuerySchema = basePaginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  attackType: z.enum(ATTACK_TYPES).optional(),
  range: z.enum(RANGES).optional(),
  clientSlug: z.string().trim().min(1).optional(),
  sensorId: z.string().trim().min(1).optional(),
  gapMinutes: z.coerce.number().int().min(1).max(240).default(15),
  sortBy: z.enum(['startedAt', 'hits', 'durationSec', 'intensity']).default('startedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

const sessionsQuerySchema = basePaginationSchema.extend({
  range: z.enum(RANGES).optional(),
  clientSlug: z.string().trim().min(1).optional(),
  sensorId: z.string().trim().min(1).optional(),
  onlyChains: z.coerce.boolean().default(false),
})

function emitAttackEvent(srcIp: string, timestamp: string, sensorId: string | null) {
  const geo = lookupGeo(srcIp)
  if (geo) eventBus.emit('attack', { type: 'http', ip: srcIp, ...geo, timestamp, sensorId, dstPort: 80 })
}

export async function webRoutes(fastify: FastifyInstance) {
  const svc = new WebService(fastify.prisma)

  // Tenant ceiling (cookie) + optional manual clientSlug/sensorId narrow. The
  // tenant scope must be in the cache key too, or one tenant poisons another's.
  async function resolveScope(request: FastifyRequest, clientSlug?: string, sensorId?: string) {
    const tenant = parseSensorScope(request.query as Record<string, unknown>)
    const sensorIds = await resolveSensorScope(fastify.prismaRead, tenant, clientSlug, sensorId)
    const scopeKey = `t=${tenant.cacheSuffix}:${clientSlug ?? ''}:${sensorId ?? ''}`
    return { sensorIds, scopeKey }
  }

  async function handleSingleEvent(request: FastifyRequest, reply: FastifyReply) {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = webHitSchema.safeParse(request.body)
    if (!parsed.success) {
      fastify.log.warn({ details: parsed.error.flatten().fieldErrors, body: request.body }, 'Rejected invalid web event')
      return reply.status(400).send({ error: 'Invalid web event', details: parsed.error.flatten().fieldErrors })
    }

    const d = { ...parsed.data, headers: normalizeHeaders(parsed.data.headers) }
    const sensorId = d.sensorId ?? null
    if (isInternalIp(d.srcIp)) return reply.status(202).send({ ignored: 'internal source IP' })

    try {
      const row = await svc.insertWebHit(d, sensorId)
      if (row) {
        lakeProducer.tee(LAKE_TOPICS.web, d.eventId, d)
        emitAttackEvent(d.srcIp, d.timestamp, sensorId)
        void forwardClientEventBySensorId(fastify.prisma, sensorId, {
          kind: 'web.event',
          event: { eventId: d.eventId, sensorId, timestamp: d.timestamp, srcIp: d.srcIp, method: d.method, path: d.path, query: d.query, userAgent: d.userAgent, headers: d.headers, body: d.body, attackType: d.attackType },
        })
        scheduleThreatAlert(fastify.prisma, d.srcIp)
        if (d.canaryTriggered) {
          void evaluateCanaryAlert(fastify.prisma, { ip: d.srcIp, path: d.path, method: d.method, userAgent: d.userAgent, timestamp: new Date(d.timestamp) })
        }
        return reply.status(201).send({ id: row.id, attackType: row.attack_type })
      }
      return reply.status(200).send({ duplicate: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      fastify.log.error({ err, srcIp: d.srcIp, path: d.path, userAgent: d.userAgent, attackType: d.attackType }, 'Failed to insert web hit')
      return reply.status(500).send({ error: msg })
    }
  }

  async function handleBatchEvents(request: FastifyRequest, reply: FastifyReply) {
    if (!ensureIngestToken(request, reply)) return reply

    const raw = Array.isArray(request.body) ? request.body : [request.body]
    const { events, invalidCount } = parseWebHitBatch(raw)

    if (invalidCount > 0) {
      fastify.log.warn({ invalid: invalidCount, total: raw.length }, 'Rejected invalid Galah web events')
    }
    if (events.length === 0) return reply.status(200).send({ inserted: 0, invalid: invalidCount })

    let inserted = 0
    for (const d of events) {
      if (isInternalIp(d.srcIp)) continue
      try {
        const row = await svc.insertWebHit(d, d.sensorId ?? null)
        if (row) {
          inserted++
          lakeProducer.tee(LAKE_TOPICS.web, d.eventId, d)
          emitAttackEvent(d.srcIp, d.timestamp, d.sensorId ?? null)
          void forwardClientEventBySensorId(fastify.prisma, d.sensorId ?? null, {
            kind: 'web.event',
            event: { eventId: d.eventId, sensorId: d.sensorId ?? null, timestamp: d.timestamp, srcIp: d.srcIp, method: d.method, path: d.path, query: d.query, userAgent: d.userAgent, headers: d.headers ?? {}, body: d.body, attackType: d.attackType },
          })
          scheduleThreatAlert(fastify.prisma, d.srcIp)
          if (d.canaryTriggered) {
            void evaluateCanaryAlert(fastify.prisma, { ip: d.srcIp, path: d.path, method: d.method, userAgent: d.userAgent, timestamp: new Date(d.timestamp) })
          }
        }
      } catch {
        // skip malformed individual events
      }
    }

    return reply.status(200).send({ inserted, total: events.length, invalid: invalidCount })
  }

  fastify.post('/ingest/web/event', (req, rep) => handleSingleEvent(req, rep))
  fastify.post('/ingest/web/vector', (req, rep) => handleBatchEvents(req, rep))

  fastify.get('/web-hits', async (request, reply) => {
    const parsed = webHitsQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid query params' })
    const { sensorIds } = await resolveScope(request)
    return reply.send(await svc.listHits({ ...parsed.data, sensorIds }))
  })

  fastify.get('/web-hits/timeline', async (request, reply) => {
    const { sensorIds, scopeKey } = await resolveScope(request)
    return reply.send(await svc.getTimeline(fastify.cache, sensorIds, scopeKey))
  })

  fastify.get('/web-hits/paths', async (request, reply) => {
    const { sensorIds, scopeKey } = await resolveScope(request)
    return reply.send(await svc.getPaths(fastify.cache, sensorIds, scopeKey))
  })

  fastify.get('/web-hits/by-ip', async (request, reply) => {
    const parsed = byIpQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query params', details: parsed.error.flatten().fieldErrors })
    }
    const { page, pageSize, offset } = getPagination(parsed.data)
    const { sensorIds, scopeKey } = await resolveScope(request, parsed.data.clientSlug, parsed.data.sensorId)
    return reply.send(await svc.getByIp(fastify.cache, {
      q: parsed.data.q,
      attackType: parsed.data.attackType,
      range: parsed.data.range,
      sortBy: parsed.data.sortBy,
      sortDir: parsed.data.sortDir,
      page, pageSize, offset, sensorIds, scopeKey,
    }))
  })

  fastify.get('/web-hits/bursts', async (request, reply) => {
    const parsed = burstsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query params', details: parsed.error.flatten().fieldErrors })
    }
    const { page, pageSize, offset } = getPagination(parsed.data)
    const { sensorIds, scopeKey } = await resolveScope(request, parsed.data.clientSlug, parsed.data.sensorId)
    return reply.send(await svc.getBursts(fastify.cache, {
      q: parsed.data.q,
      attackType: parsed.data.attackType,
      range: parsed.data.range,
      gapMinutes: parsed.data.gapMinutes,
      sortBy: parsed.data.sortBy,
      sortDir: parsed.data.sortDir,
      page, pageSize, offset, sensorIds, scopeKey,
    }))
  })

  fastify.get('/web-hits/hourly', async (request, reply) => {
    const parsed = statsQuerySchema.safeParse(request.query)
    const range = parsed.success ? parsed.data.range : undefined
    const clientSlug = parsed.success ? parsed.data.clientSlug : undefined
    const sensorId = parsed.success ? parsed.data.sensorId : undefined
    const { sensorIds, scopeKey } = await resolveScope(request, clientSlug, sensorId)
    return reply.send(await svc.getHourly(fastify.cache, range, sensorIds, scopeKey))
  })

  fastify.get('/web-hits/stats', async (request, reply) => {
    const parsed = statsQuerySchema.safeParse(request.query)
    const range = parsed.success ? parsed.data.range : undefined
    const clientSlug = parsed.success ? parsed.data.clientSlug : undefined
    const sensorId = parsed.success ? parsed.data.sensorId : undefined
    const { sensorIds, scopeKey } = await resolveScope(request, clientSlug, sensorId)
    return reply.send(await svc.getStats(fastify.cache, range, sensorIds, scopeKey))
  })

  fastify.get('/web-hits/sessions', async (request, reply) => {
    const parsed = sessionsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query params', details: parsed.error.flatten().fieldErrors })
    }
    const { page, pageSize, offset } = getPagination(parsed.data)
    const { sensorIds, scopeKey } = await resolveScope(request, parsed.data.clientSlug, parsed.data.sensorId)
    return reply.send(await svc.getSessions(fastify.cache, {
      range: parsed.data.range,
      onlyChains: parsed.data.onlyChains,
      page, pageSize, offset, sensorIds, scopeKey,
    }))
  })

  fastify.get('/web-hits/sessions/:fingerprint', async (request, reply) => {
    const { fingerprint } = (request.params as { fingerprint: string })
    if (!fingerprint?.trim()) return reply.status(400).send({ error: 'fingerprint required' })
    const fp = decodeURIComponent(fingerprint)
    const { sensorIds } = await resolveScope(request)
    const hits = await svc.getSessionHits(fp, sensorIds)
    if (hits.length === 0) return reply.status(404).send({ error: 'session not found' })
    return reply.send({ fingerprint: fp, hits })
  })
}
