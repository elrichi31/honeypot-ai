import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../../lib/ingest-auth.js'
import { SensorService } from './sensors.service.js'

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

  // sensor-update fetches its regenerated compose here. The generator lives in
  // the dashboard, which sensors cannot reach (only ingest-api is published), so
  // this hop exists purely to bridge that: same shared secret in, compose out.
  fastify.get('/sensor/compose', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = z.object({
      deployId: z.string().trim().min(1),
      services: z.string().trim().min(1),
      clientSlug: z.string().trim().default(''),
      clientName: z.string().trim().default(''),
      // Which part of the install to hand back: the compose, the manifest of
      // everything else it owns, or one helper command.
      kind: z.enum(['compose', 'files', 'helper']).default('compose'),
      name: z.string().trim().default(''),
    }).safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
    }

    const base = process.env.DASHBOARD_INTERNAL_URL
    if (!base) {
      return reply.status(503).send({ error: 'DASHBOARD_INTERNAL_URL is not set; compose refresh unavailable' })
    }

    const url = new URL('/api/sensor/compose/refresh', base)
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value) url.searchParams.set(key, value)
    }

    try {
      const res = await fetch(url, {
        headers: { 'X-Ingest-Token': process.env.INGEST_SHARED_SECRET ?? '' },
        signal: AbortSignal.timeout(10_000),
        // Following one would silently turn the dashboard's auth redirect into a
        // 200 carrying the login page, which the sensor would treat as a compose.
        redirect: 'manual',
      })
      if (!res.ok) {
        return reply.status(502).send({ error: `Dashboard returned ${res.status}` })
      }
      const body = await res.text()
      if (body.trimStart().startsWith('<')) {
        request.log.error('compose refresh: dashboard returned markup, not a compose')
        return reply.status(502).send({ error: 'Dashboard returned markup, not a compose' })
      }
      return reply.header('Content-Type', 'text/plain; charset=utf-8').send(body)
    } catch (err) {
      request.log.error({ err }, 'compose refresh: dashboard unreachable')
      return reply.status(502).send({ error: 'Dashboard unreachable' })
    }
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
