import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { IocsService } from './iocs.service.js'

const PERIOD_DAYS: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 }

const iocsQuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d', '90d']).default('90d'),
})

export async function iocsRoutes(fastify: FastifyInstance) {
  const svc = new IocsService(fastify.prismaRead)

  fastify.get('/iocs', async (request, reply) => {
    const parsed = iocsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query params',
        details: parsed.error.flatten().fieldErrors,
      })
    }
    const windowDays = PERIOD_DAYS[parsed.data.period]
    const iocs = await svc.listAggregatedIocs(fastify.cache, windowDays)
    return reply.send(iocs)
  })
}
