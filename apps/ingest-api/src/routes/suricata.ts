import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'
import { SuricataService, type Range } from '../modules/suricata/suricata.service.js'

const eveAlertSchema = z.object({
  timestamp: z.string(),
  flow_id: z.number().optional(),
  in_iface: z.string().optional(),
  event_type: z.literal('alert'),
  src_ip: z.string().default(''),
  src_port: z.number().int().optional(),
  dest_ip: z.string().default(''),
  dest_port: z.number().int().optional(),
  proto: z.string().default(''),
  sensor_id: z.string().default(''),
  alert: z.object({
    action: z.string().default('allowed'),
    gid: z.number().optional(),
    signature_id: z.number().int().default(0),
    rev: z.number().optional(),
    signature: z.string().default(''),
    category: z.string().default(''),
    severity: z.number().int().min(1).max(4).default(3),
  }),
})

const VALID_RANGES = new Set(['24h', '7d', '30d'])

export async function suricataRoutes(fastify: FastifyInstance) {
  const svc = new SuricataService(fastify.prisma, fastify.prismaRead)

  fastify.post('/ingest/suricata/alert', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const events: unknown[] = Array.isArray(request.body) ? request.body : [request.body]
    const valid: z.infer<typeof eveAlertSchema>[] = []
    let rejected = 0
    for (const event of events) {
      const parsed = eveAlertSchema.safeParse(event)
      if (parsed.success) valid.push(parsed.data)
      else rejected++
    }

    let stored = 0
    try {
      stored = await svc.persistAlerts(valid)
    } catch (err) {
      fastify.log.error({ err }, 'suricata alert batch persist failed')
      return reply.status(500).send({ error: 'persist failed' })
    }

    return reply.status(200).send({ accepted: valid.length, stored, rejected })
  })

  fastify.get('/suricata/alerts', async (request, reply) => {
    const params = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(10).max(200).default(50),
      severity: z.coerce.number().int().min(1).max(4).optional(),
      srcIp: z.string().optional(),
      q: z.string().optional(),
      hideNoise: z.coerce.boolean().default(true),
      excludeOwnIps: z.coerce.boolean().default(true),
    }).safeParse(request.query)
    if (!params.success) return reply.status(400).send({ error: 'Invalid query params' })

    return reply.send(await svc.listAlerts(params.data))
  })

  fastify.get('/suricata/stats', async (request, reply) => {
    const rangeParam = (request.query as Record<string, string>).range ?? '24h'
    const range = (VALID_RANGES.has(rangeParam) ? rangeParam : '24h') as Range
    return reply.send(await svc.getStats(fastify.cache, range))
  })
}
