import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ClientService } from './clients.service.js'

const slugParam = z.object({ clientSlug: z.string().trim().min(1) })
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export async function clientObservabilityRoutes(fastify: FastifyInstance) {
  const svc = new ClientService(fastify.prisma, fastify.prismaRead)

  fastify.get('/clients/:clientSlug/events', async (request, reply) => {
    const params = slugParam.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client slug' })

    const query = pageQuery.extend({
      source:   z.enum(['ssh', 'protocol', 'web', 'all']).default('all'),
      sensorId: z.string().trim().min(1).optional(),
      ip:       z.string().trim().optional(),
      q:        z.string().trim().min(1).max(200).optional(),
    }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' })

    const result = await svc.getEventLog(fastify.cache, { clientSlug: params.data.clientSlug, ...query.data })
    if ('error' in result) return reply.status(result.status as number).send({ error: result.error })
    return reply.send(result)
  })

  fastify.get('/clients/:clientSlug/timeline', async (request, reply) => {
    const params = slugParam.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client slug' })

    const query = z.object({
      range: z.enum(['day', 'week', 'month']).default('week'),
      sensorId: z.string().trim().min(1).optional(),
    }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' })

    const result = await svc.getTimeline(fastify.cache, { clientSlug: params.data.clientSlug, ...query.data })
    if (result && 'error' in result) return reply.status(result.status).send({ error: result.error })
    return reply.send(result)
  })

  fastify.get('/clients/:clientSlug/threats', async (request, reply) => {
    const params = slugParam.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client slug' })

    const query = pageQuery.extend({ pageSize: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' })

    const result = await svc.getThreats(fastify.cache, { clientSlug: params.data.clientSlug, page: query.data.page, pageSize: query.data.pageSize ?? 20 })
    if ('error' in result) return reply.status(result.status).send({ error: result.error })
    return reply.send(result)
  })

  fastify.get('/clients/:clientSlug/today', async (request, reply) => {
    const params = slugParam.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client slug' })

    const result = await svc.getToday(fastify.cache, { clientSlug: params.data.clientSlug })
    if ('error' in result) return reply.status(result.status).send({ error: result.error })
    return reply.send(result)
  })
}
