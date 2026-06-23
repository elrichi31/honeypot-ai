import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'
import { eventBus } from '../lib/event-bus.js'
import { lookupGeo } from '../lib/geo.js'
import { scheduleThreatAlert, evaluateDeceptionAlert } from '../lib/threat-alerts.js'
import { forwardClientEventBySensorId } from '../lib/client-forward.js'
import { enqueueProtocolHit } from '../lib/protocol-batch.js'
import { ProtocolService } from '../modules/protocol/protocol.service.js'

const protocolEventSchema = z.object({
  eventId: z.string().uuid(),
  sensorId: z.string().min(1).optional(),
  protocol: z.string().min(1),
  srcIp: z.string().min(1),
  srcPort: z.number().int().nullable().optional(),
  dstPort: z.number().int(),
  eventType: z.enum(['connect', 'auth', 'command', 'file.upload', 'file.download']),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  data: z.record(z.unknown()).default({}),
  timestamp: z.string().datetime({ offset: true }),
})

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  protocol: z.string().optional(),
})

const insightsQuerySchema = z.object({
  protocol: z.string().min(1),
})

export async function protocolRoutes(fastify: FastifyInstance) {
  const svc = new ProtocolService(fastify.prismaRead)

  fastify.post('/ingest/protocol/event', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = protocolEventSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid event', details: parsed.error.flatten() })

    const d = parsed.data
    const sensorId = d.sensorId ?? (typeof d.data?.sensor === 'string' ? d.data.sensor : null)

    const id = enqueueProtocolHit({
      eventId: d.eventId, sensorId: sensorId ?? null, protocol: d.protocol,
      srcIp: d.srcIp, srcPort: d.srcPort ?? null, dstPort: d.dstPort,
      eventType: d.eventType, username: d.username ?? null, password: d.password ?? null,
      data: d.data as Record<string, unknown>, timestamp: new Date(d.timestamp),
    })

    const geo = lookupGeo(d.srcIp)
    if (geo) eventBus.emit('attack', { type: d.protocol, ip: d.srcIp, ...geo, timestamp: d.timestamp, dstPort: d.dstPort })

    void forwardClientEventBySensorId(fastify.prisma, sensorId, {
      kind: 'protocol.event',
      event: { eventId: d.eventId, sensorId, protocol: d.protocol, srcIp: d.srcIp, srcPort: d.srcPort ?? null, dstPort: d.dstPort, eventType: d.eventType, username: d.username ?? null, password: d.password ?? null, data: d.data, timestamp: d.timestamp },
    })
    scheduleThreatAlert(fastify.prisma, d.srcIp)

    if (d.data?.source === 'opencanary') {
      const nodeId = typeof d.data.node_id === 'string' ? d.data.node_id : (sensorId ?? 'unknown')
      void evaluateDeceptionAlert(fastify.prisma, {
        internalIp: d.srcIp, nodeId, protocol: d.protocol, eventType: d.eventType,
        timestamp: new Date(d.timestamp), username: d.username ?? null, password: d.password ?? null,
      })
    }

    return reply.status(201).send({ id })
  })

  fastify.get('/protocol-hits', async (request, reply) => {
    const q = listQuerySchema.parse(request.query)
    return reply.send(await svc.list(q.protocol ?? null, q.limit, q.page))
  })

  fastify.get('/protocol-hits/insights', async (request, reply) => {
    const q = insightsQuerySchema.parse(request.query)
    return reply.send(await svc.getInsights(fastify.cache, q.protocol))
  })

  fastify.get('/protocol-hits/stats', async (_request, reply) => {
    return reply.send(await svc.getStats(fastify.cache))
  })

  fastify.get('/protocol-hits/ports/stats', async (_request, reply) => {
    return reply.send(await svc.getPortStats(fastify.cache))
  })
}
