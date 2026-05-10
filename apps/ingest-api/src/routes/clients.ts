import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'

const clientSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().default(''),
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

export async function clientRoutes(fastify: FastifyInstance) {
  fastify.get('/clients', async (_request, reply) => {
    const clients = await fastify.prisma.$queryRaw<Array<{
      id: string
      name: string
      slug: string
      description: string
      forward_url: string
      created_at: Date
    }>>`
      SELECT id, name, slug, description, forward_url, created_at
      FROM clients
      ORDER BY name ASC, created_at ASC
    `

    return reply.send(
      clients.map((client) => ({
        id: client.id,
        name: client.name,
        slug: client.slug,
        description: client.description,
        forwardUrl: client.forward_url,
        createdAt: client.created_at,
      })),
    )
  })

  fastify.post('/clients', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = clientSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid client payload', details: parsed.error.flatten() })
    }

    const name = parsed.data.name
    const slug = slugifyClient(parsed.data.slug || name)
    if (!slug) return reply.status(400).send({ error: 'Invalid client slug' })

    const description = parsed.data.description
    const forwardUrl = parsed.data.forwardUrl
    if (forwardUrl && !/^https?:\/\//i.test(forwardUrl)) {
      return reply.status(400).send({ error: 'Forward URL must start with http:// or https://' })
    }
    const now = new Date()

    const rows = await fastify.prisma.$queryRaw<Array<{
      id: string
      name: string
      slug: string
      description: string
      forward_url: string
      created_at: Date
    }>>`
      INSERT INTO clients (id, name, slug, description, forward_url, created_at)
      VALUES (gen_random_uuid()::text, ${name}, ${slug}, ${description}, ${forwardUrl}, ${now})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        forward_url = EXCLUDED.forward_url
      RETURNING id, name, slug, description, forward_url, created_at
    `

    const client = rows[0]

    return reply.send({
      id: client.id,
      name: client.name,
      slug: client.slug,
      description: client.description,
      forwardUrl: client.forward_url,
      createdAt: client.created_at,
    })
  })

  fastify.patch('/clients/:clientId', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const params = z.object({ clientId: z.string().trim().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client id' })

    const parsed = z
      .object({
        name: z.string().trim().min(1).optional(),
        description: z.string().trim().optional(),
        forwardUrl: z.string().trim().optional(),
      })
      .safeParse(request.body)

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid client payload', details: parsed.error.flatten() })
    }

    const currentRows = await fastify.prisma.$queryRaw<Array<{
      id: string
      name: string
      slug: string
      description: string
      forward_url: string
      created_at: Date
    }>>`
      SELECT id, name, slug, description, forward_url, created_at
      FROM clients
      WHERE id = ${params.data.clientId}
      LIMIT 1
    `

    const current = currentRows[0]
    if (!current) return reply.status(404).send({ error: 'Client not found' })

    const nextName = parsed.data.name ?? current.name
    const nextDescription = parsed.data.description ?? current.description
    const nextForwardUrl = parsed.data.forwardUrl ?? current.forward_url

    if (nextForwardUrl && !/^https?:\/\//i.test(nextForwardUrl)) {
      return reply.status(400).send({ error: 'Forward URL must start with http:// or https://' })
    }

    const rows = await fastify.prisma.$queryRaw<Array<{
      id: string
      name: string
      slug: string
      description: string
      forward_url: string
      created_at: Date
    }>>`
      UPDATE clients
      SET
        name = ${nextName},
        description = ${nextDescription},
        forward_url = ${nextForwardUrl}
      WHERE id = ${params.data.clientId}
      RETURNING id, name, slug, description, forward_url, created_at
    `

    const client = rows[0]
    return reply.send({
      id: client.id,
      name: client.name,
      slug: client.slug,
      description: client.description,
      forwardUrl: client.forward_url,
      createdAt: client.created_at,
    })
  })
}
