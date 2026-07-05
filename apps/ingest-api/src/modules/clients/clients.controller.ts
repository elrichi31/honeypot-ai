import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../../lib/ingest-auth.js'
import { ClientService } from './clients.service.js'

const clientSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().default(''),
  code: z.string().trim().default(''),
  description: z.string().trim().default(''),
  forwardUrl: z.string().trim().default(''),
  crowdstrikeHecUrl: z.string().trim().default(''),
  crowdstrikeApiKey: z.string().trim().default(''),
})

export async function clientRoutes(fastify: FastifyInstance) {
  const svc = new ClientService(fastify.prisma, fastify.prismaRead)

  fastify.get('/clients', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    return reply.send(await svc.list(fastify.cache))
  })

  fastify.post('/clients', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const parsed = clientSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid client payload', details: parsed.error.flatten() })
    const result = await svc.create(fastify.cache, parsed.data)
    if ('error' in result) return reply.status(result.status).send({ error: result.error })
    return reply.send(result)
  })

  fastify.patch('/clients/:clientId', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const params = z.object({ clientId: z.string().trim().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client id' })
    const parsed = z.object({
      name: z.string().trim().min(1).optional(),
      code: z.string().trim().optional(),
      description: z.string().trim().optional(),
      forwardUrl: z.string().trim().optional(),
      crowdstrikeHecUrl: z.string().trim().optional(),
      crowdstrikeApiKey: z.string().trim().optional(),
    }).safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid client payload', details: parsed.error.flatten() })
    const result = await svc.patch(fastify.cache, params.data.clientId, parsed.data)
    if ('error' in result) return reply.status(result.status).send({ error: result.error })
    return reply.send(result)
  })

  fastify.delete('/clients/:clientId', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const params = z.object({ clientId: z.string().trim().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client id' })
    const result = await svc.delete(fastify.cache, params.data.clientId)
    if (result !== true) return reply.status(result.status).send({ error: result.error })
    return reply.status(204).send()
  })
}
