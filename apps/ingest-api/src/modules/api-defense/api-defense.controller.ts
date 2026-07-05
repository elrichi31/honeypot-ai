import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ApiDefenseService } from './api-defense.service.js'

// RFC 1918 + loopback — always treated as trusted regardless of allowlist
const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/

export async function apiDefenseRoutes(fastify: FastifyInstance) {
  const svc = new ApiDefenseService(fastify.prisma)

  // ── Events ────────────────────────────────────────────────────────────────
  fastify.get('/api-defense/events', async (request, reply) => {
    const query = z.object({
      page:       z.coerce.number().int().min(1).default(1),
      pageSize:   z.coerce.number().int().min(1).max(100).default(25),
      attackType: z.string().trim().optional(),
      ip:         z.string().trim().optional(),
    }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' })

    return reply.send(await svc.listEvents(query.data))
  })

  fastify.get('/api-defense/summary', async (_request, reply) => {
    return reply.send(await svc.getSummary())
  })

  // ── Allowlist ─────────────────────────────────────────────────────────────
  fastify.get('/api-defense/allowlist', async (_request, reply) => {
    return reply.send(await svc.listAllowlist())
  })

  fastify.post('/api-defense/allowlist', async (request, reply) => {
    const body = z.object({
      entry: z.string().trim().regex(CIDR_RE, 'Must be a valid IPv4 address or CIDR (e.g. 1.2.3.4 or 1.2.3.0/24)'),
      label: z.string().trim().max(120).default(''),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.errors[0].message })

    const result = await svc.createAllowlistEntry(body.data.entry, body.data.label)
    if ('error' in result) return reply.status(result.status).send({ error: result.error })
    return reply.status(201).send(result)
  })

  fastify.delete('/api-defense/allowlist/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const deleted = await svc.deleteAllowlistEntry(id)
    if (!deleted) return reply.status(404).send({ error: 'Not found' })
    return reply.status(204).send()
  })

  // ── Blocked IPs ───────────────────────────────────────────────────────────
  fastify.get('/api-defense/blocked', async (_request, reply) => {
    return reply.send(await svc.listBlocked())
  })

  fastify.post('/api-defense/blocked', async (request, reply) => {
    const body = z.object({
      ip:     z.string().trim().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Must be a valid IPv4 address'),
      reason: z.string().trim().max(120).default('manual'),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.errors[0].message })

    const result = await svc.createBlocked(body.data.ip, body.data.reason)
    if ('error' in result) return reply.status(result.status).send({ error: result.error })
    return reply.status(201).send(result)
  })

  fastify.delete('/api-defense/blocked/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const deleted = await svc.deleteBlocked(id)
    if (!deleted) return reply.status(404).send({ error: 'Not found' })
    return reply.status(204).send()
  })
}
