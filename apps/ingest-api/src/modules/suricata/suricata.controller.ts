import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../../lib/ingest-auth.js'
import { SuricataService, type Range } from './suricata.service.js'
import { eveAlertSchema } from './suricata.schema.js'

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
