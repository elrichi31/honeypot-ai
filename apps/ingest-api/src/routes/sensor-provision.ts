import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'
import { SensorService } from '../modules/sensors/sensors.service.js'

const VALID_SERVICES = ['ssh', 'http', 'ftp', 'mysql', 'port'] as const

export async function sensorProvisionRoutes(fastify: FastifyInstance) {
  const svc = new SensorService(fastify.prisma, fastify.prismaRead)

  fastify.post('/sensor/tokens', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = z.object({
      clientId: z.string().trim().min(1).optional().nullable(),
      services: z.array(z.enum(VALID_SERVICES)).min(1).default([...VALID_SERVICES]),
      expiresInHours: z.number().int().positive().default(168),
    }).safeParse(request.body)

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() })
    }

    const result = await svc.createProvisionToken(parsed.data)
    if ('error' in result) return reply.status(result.status).send({ error: result.error })
    return reply.status(201).send(result)
  })

  fastify.get('/sensor/provision', async (request, reply) => {
    const parsed = z.object({ token: z.string().trim().min(1) }).safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: 'Missing token' })

    const result = await svc.redeemProvisionToken(parsed.data.token, process.env.INGEST_SHARED_SECRET ?? '')
    if ('error' in result) return reply.status(result.status).send({ error: result.error })

    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .send(result.lines)
  })
}
