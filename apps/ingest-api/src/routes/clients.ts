import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'
import { withCache } from '../lib/cache-helper.js'

const clientSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().default(''),
  code: z.string().trim().default(''),
  description: z.string().trim().default(''),
  forwardUrl: z.string().trim().default(''),
})

function slugifyClient(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeClientCode(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '')
    .trim()
    .toUpperCase()
}

function deriveClientCode(value: string): string {
  return normalizeClientCode(value).slice(0, 12)
}

export async function clientRoutes(fastify: FastifyInstance) {
  fastify.get('/clients', async (_request, reply) => {
    const clients = await withCache(fastify.cache, 'clients:list', 120, async () => {
      const rows = await fastify.prisma.$queryRaw<Array<{
        id: string; name: string; slug: string; code: string; description: string; forward_url: string; created_at: Date
      }>>`
        SELECT id, name, slug, code, description, forward_url, created_at
        FROM clients ORDER BY name ASC, created_at ASC
      `
      return rows.map((c) => ({
        id: c.id, name: c.name, slug: c.slug,
        code: c.code || deriveClientCode(c.slug || c.name),
        description: c.description, forwardUrl: c.forward_url, createdAt: c.created_at,
      }))
    })
    return reply.send(clients)
  })

  fastify.post('/clients', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = clientSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid client payload', details: parsed.error.flatten() })

    const name = parsed.data.name
    const slug = slugifyClient(parsed.data.slug || name)
    if (!slug) return reply.status(400).send({ error: 'Invalid client slug' })
    const code = normalizeClientCode(parsed.data.code || deriveClientCode(slug || name))
    if (!code) return reply.status(400).send({ error: 'Invalid client code' })

    const { description, forwardUrl } = parsed.data
    if (forwardUrl && !/^https?:\/\//i.test(forwardUrl)) {
      return reply.status(400).send({ error: 'Forward URL must start with http:// or https://' })
    }

    const rows = await fastify.prisma.$queryRaw<Array<{
      id: string; name: string; slug: string; code: string; description: string; forward_url: string; created_at: Date
    }>>`
      INSERT INTO clients (id, name, slug, code, description, forward_url, created_at)
      VALUES (gen_random_uuid()::text, ${name}, ${slug}, ${code}, ${description}, ${forwardUrl}, ${new Date()})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, code = EXCLUDED.code,
        description = EXCLUDED.description, forward_url = EXCLUDED.forward_url
      RETURNING id, name, slug, code, description, forward_url, created_at
    `
    const c = rows[0]
    return reply.send({ id: c.id, name: c.name, slug: c.slug, code: c.code || code, description: c.description, forwardUrl: c.forward_url, createdAt: c.created_at })
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
    }).safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid client payload', details: parsed.error.flatten() })

    const currentRows = await fastify.prisma.$queryRaw<Array<{
      id: string; name: string; slug: string; code: string; description: string; forward_url: string; created_at: Date
    }>>`
      SELECT id, name, slug, code, description, forward_url, created_at
      FROM clients WHERE id = ${params.data.clientId} LIMIT 1
    `
    const current = currentRows[0]
    if (!current) return reply.status(404).send({ error: 'Client not found' })

    const nextName        = parsed.data.name ?? current.name
    const nextCode        = parsed.data.code !== undefined
      ? normalizeClientCode(parsed.data.code || deriveClientCode(current.slug || nextName))
      : current.code || deriveClientCode(current.slug || nextName)
    const nextDescription = parsed.data.description ?? current.description
    const nextForwardUrl  = parsed.data.forwardUrl  ?? current.forward_url
    if (!nextCode) return reply.status(400).send({ error: 'Invalid client code' })
    if (nextForwardUrl && !/^https?:\/\//i.test(nextForwardUrl)) {
      return reply.status(400).send({ error: 'Forward URL must start with http:// or https://' })
    }

    const rows = await fastify.prisma.$queryRaw<Array<{
      id: string; name: string; slug: string; code: string; description: string; forward_url: string; created_at: Date
    }>>`
      UPDATE clients SET name = ${nextName}, code = ${nextCode},
        description = ${nextDescription}, forward_url = ${nextForwardUrl}
      WHERE id = ${params.data.clientId}
      RETURNING id, name, slug, code, description, forward_url, created_at
    `
    const c = rows[0]
    return reply.send({ id: c.id, name: c.name, slug: c.slug, code: c.code || nextCode, description: c.description, forwardUrl: c.forward_url, createdAt: c.created_at })
  })

  fastify.delete('/clients/:clientId', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const params = z.object({ clientId: z.string().trim().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client id' })

    const existing = await fastify.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM clients WHERE id = ${params.data.clientId} LIMIT 1
    `
    if (!existing[0]) return reply.status(404).send({ error: 'Client not found' })

    await fastify.prisma.$executeRaw`UPDATE sensors SET client_id = NULL WHERE client_id = ${params.data.clientId}`
    await fastify.prisma.$executeRaw`DELETE FROM clients WHERE id = ${params.data.clientId}`
    return reply.status(204).send()
  })
}
