import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  unreadOnly: z.coerce.boolean().default(false),
})

export async function alertRoutes(fastify: FastifyInstance) {
  // List recent alerts across all clients/sensors, plus the unread count.
  fastify.get('/alerts', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid query' })
    const { limit, unreadOnly } = parsed.data

    const [alerts, unread] = await Promise.all([
      fastify.prisma.alert.findMany({
        where: unreadOnly ? { readAt: null } : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      fastify.prisma.alert.count({ where: { readAt: null } }),
    ])

    return reply.send({ alerts, unreadCount: unread })
  })

  // Mark a single alert as read.
  fastify.post('/alerts/:id/read', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid id' })

    const result = await fastify.prisma.alert.updateMany({
      where: { id: params.data.id, readAt: null },
      data: { readAt: new Date() },
    })
    return reply.send({ updated: result.count })
  })

  // Mark every unread alert as read.
  fastify.post('/alerts/read-all', async (_request, reply) => {
    const result = await fastify.prisma.alert.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() },
    })
    return reply.send({ updated: result.count })
  })
}
