import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../../lib/ingest-auth.js'
import { DeceptionService, type Scope } from './deception.service.js'

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  nodeId: z.string().optional(),
})

const portscansIngestSchema = z.object({
  id: z.string(),
  sensorId: z.string(),
  srcIp: z.string().min(1),
  dstPorts: z.array(z.number().int()).default([]),
  nodeId: z.string().optional(),
  scanType: z.string().default('syn'),
  timestamp: z.string(),
})

export async function deceptionRoutes(fastify: FastifyInstance) {
  const svc = new DeceptionService(fastify.prisma, fastify.prismaRead)

  async function resolveScope(clientSlug: string, reply: FastifyReply): Promise<Scope | undefined> {
    const scope = await svc.resolveScope(clientSlug)
    if (!scope) { reply.status(404).send({ error: 'client not found' }); return undefined }
    return scope
  }

  fastify.post('/ingest/deception/portscan', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const body = portscansIngestSchema.parse(request.body)
    await svc.ingestPortscan(body)
    return reply.status(201).send({ ok: true })
  })

  // ── Global ────────────────────────────────────────────────────────────────
  fastify.get('/deception/overview', (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    return svc.getOverview(fastify.cache, null, 'deception:overview').then(reply.send.bind(reply))
  })

  fastify.get('/deception/nodes', (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    return svc.getNodes(fastify.cache, null, 'deception:nodes').then(reply.send.bind(reply))
  })

  fastify.get('/deception/killchain', (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(200) }).parse(request.query)
    return svc.getKillchain(fastify.cache, null, q.limit, `deception:killchain:${q.limit}`).then(reply.send.bind(reply))
  })

  fastify.get('/deception/events', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const q = pageQuery.parse(request.query)
    return reply.send(await svc.getEvents(null, q.page, q.limit, q.nodeId ?? null))
  })

  fastify.get('/deception/portscans', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const q = pageQuery.parse(request.query)
    return reply.send(await svc.getPortscans(null, q.page, q.limit, q.nodeId ?? null))
  })

  // ── Per-client ────────────────────────────────────────────────────────────
  fastify.get('/clients/:clientSlug/deception/overview', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const { clientSlug } = request.params as { clientSlug: string }
    const scope = await resolveScope(clientSlug, reply)
    if (!scope) return
    return svc.getOverview(fastify.cache, scope, `deception:${clientSlug}:overview`).then(reply.send.bind(reply))
  })

  fastify.get('/clients/:clientSlug/deception/nodes', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const { clientSlug } = request.params as { clientSlug: string }
    const scope = await resolveScope(clientSlug, reply)
    if (!scope) return
    return svc.getNodes(fastify.cache, scope, `deception:${clientSlug}:nodes`).then(reply.send.bind(reply))
  })

  fastify.get('/clients/:clientSlug/deception/killchain', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const { clientSlug } = request.params as { clientSlug: string }
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(200) }).parse(request.query)
    const scope = await resolveScope(clientSlug, reply)
    if (!scope) return
    return svc.getKillchain(fastify.cache, scope, q.limit, `deception:${clientSlug}:killchain:${q.limit}`).then(reply.send.bind(reply))
  })

  fastify.get('/clients/:clientSlug/deception/events', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const { clientSlug } = request.params as { clientSlug: string }
    const q = pageQuery.parse(request.query)
    const scope = await resolveScope(clientSlug, reply)
    if (!scope) return
    return reply.send(await svc.getEvents(scope, q.page, q.limit, q.nodeId ?? null))
  })

  fastify.get('/clients/:clientSlug/deception/portscans', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const { clientSlug } = request.params as { clientSlug: string }
    const q = pageQuery.parse(request.query)
    const scope = await resolveScope(clientSlug, reply)
    if (!scope) return
    return reply.send(await svc.getPortscans(scope, q.page, q.limit, q.nodeId ?? null))
  })
}
