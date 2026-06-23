import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AlertService } from '../modules/alerts/alerts.service.js'

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  unreadOnly: z.coerce.boolean().default(false),
  clientId: z.string().min(1).optional(),
})

const deleteQuerySchema = z.object({
  clientId: z.string().min(1).optional(),
})

export async function alertRoutes(fastify: FastifyInstance) {
  const svc = new AlertService(fastify.prisma)

  fastify.get('/alerts', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid query' })
    const result = await svc.list(parsed.data)
    return reply.send(result)
  })

  fastify.post('/alerts/:id/read', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid id' })
    const updated = await svc.markRead(params.data.id)
    return reply.send({ updated })
  })

  fastify.post('/alerts/read-all', async (request, reply) => {
    const parsed = deleteQuerySchema.safeParse(request.query)
    const clientId = parsed.success ? parsed.data.clientId : undefined
    const updated = await svc.markAllRead(clientId)
    return reply.send({ updated })
  })

  fastify.delete('/alerts', async (request, reply) => {
    const parsed = deleteQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid query' })
    const deleted = await svc.deleteAll(parsed.data.clientId)
    return reply.send({ deleted })
  })

  fastify.delete('/alerts/:id', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid id' })
    const query = deleteQuerySchema.safeParse(request.query)
    const clientId = query.success ? query.data.clientId : undefined
    const deleted = await svc.deleteOne(params.data.id, clientId)
    return reply.send({ deleted })
  })
}
