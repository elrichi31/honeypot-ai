import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'

const clientSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().default(''),
  description: z.string().trim().default(''),
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
      created_at: Date
    }>>`
      SELECT id, name, slug, description, created_at
      FROM clients
      ORDER BY name ASC, created_at ASC
    `

    return reply.send(
      clients.map((client) => ({
        id: client.id,
        name: client.name,
        slug: client.slug,
        description: client.description,
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
    const now = new Date()

    const rows = await fastify.prisma.$queryRaw<Array<{
      id: string
      name: string
      slug: string
      description: string
      created_at: Date
    }>>`
      INSERT INTO clients (id, name, slug, description, created_at)
      VALUES (gen_random_uuid()::text, ${name}, ${slug}, ${description}, ${now})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description
      RETURNING id, name, slug, description, created_at
    `

    const client = rows[0]

    return reply.send({
      id: client.id,
      name: client.name,
      slug: client.slug,
      description: client.description,
      createdAt: client.created_at,
    })
  })
}
