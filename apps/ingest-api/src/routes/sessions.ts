import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { basePaginationSchema, getPagination } from '../lib/pagination.js'
import { SessionService } from '../modules/sessions/session.service.js'

const sessionListQuerySchema = basePaginationSchema.extend({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().min(1).optional(),
  outcome: z.enum(['all', 'compromised', 'blocked']).optional(),
  actor: z.enum(['all', 'bot', 'human', 'unknown']).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  clientSlug: z.string().trim().min(1).optional(),
  sensorId: z.string().trim().min(1).optional(),
})

function parseQuery(request: any, reply: any) {
  const parsed = sessionListQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    reply.status(400).send({ error: 'Invalid query params', details: parsed.error.flatten().fieldErrors })
    return null
  }
  return parsed.data
}

export async function sessionRoutes(fastify: FastifyInstance) {
  const svc = new SessionService(fastify.prisma, fastify.prismaRead)

  fastify.get('/sessions', async (request, reply) => {
    const params = parseQuery(request, reply)
    if (!params) return
    const { page, pageSize, offset } = getPagination(params)
    return svc.list(fastify.cache, { ...params, page, pageSize, offset })
  })

  fastify.get('/sessions/scan-groups', async (request, reply) => {
    const params = parseQuery(request, reply)
    if (!params) return
    const { page, pageSize, offset } = getPagination(params)
    return svc.scanGroups(fastify.cache, { ...params, page, pageSize, offset })
  })

  fastify.get('/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const session = await svc.getById(id)
    if (!session) return reply.status(404).send({ error: 'Session not found' })
    return session
  })

  fastify.post('/sessions/backfill-actor', async (_request, reply) => {
    return reply.send(await svc.backfillActor())
  })
}
