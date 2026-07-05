import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { StorageService, type Range } from './storage.service.js'

export async function storageRoutes(fastify: FastifyInstance) {
  const svc = new StorageService(fastify.prisma)

  fastify.get('/storage/stats', async (_request, reply) => {
    return reply.send(await svc.getStats())
  })

  fastify.get('/storage/ingestion', async (request, reply) => {
    const q = z.object({
      range: z.enum(['24h', '7d', '30d']).default('7d'),
    }).safeParse(request.query)
    if (!q.success) return reply.status(400).send({ error: 'Invalid range' })
    return reply.send(await svc.getIngestion(q.data.range as Range))
  })

  fastify.get('/storage/retention', async (_request, reply) => {
    return reply.send(await svc.getRetention())
  })

  fastify.put('/storage/retention/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      retentionDays: z.number().int().min(1).max(3650).optional(),
      enabled:       z.boolean().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid body' })

    const row = await svc.updateRetention(id, body.data.retentionDays, body.data.enabled)
    if (!row) return reply.status(404).send({ error: 'Not found' })
    return reply.send(row)
  })
}
