import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { ensureIngestToken } from '../lib/ingest-auth.js'

export async function sensorProvisionRoutes(fastify: FastifyInstance) {
  // POST /sensor/tokens — generate a provisioning token for a client (auth required)
  fastify.post('/sensor/tokens', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = z.object({
      clientId: z.string().trim().min(1),
      expiresInHours: z.number().int().positive().default(168), // 7 days
    }).safeParse(request.body)

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() })
    }

    const { clientId, expiresInHours } = parsed.data

    const clients = await fastify.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM clients WHERE id = ${clientId} LIMIT 1
    `
    if (!clients[0]) return reply.status(404).send({ error: 'Client not found' })

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000)
    const id = `spt_${randomBytes(8).toString('hex')}`

    await fastify.prisma.$executeRaw`
      INSERT INTO sensor_provision_tokens (id, token, client_id, created_at, expires_at)
      VALUES (${id}, ${token}, ${clientId}, NOW(), ${expiresAt})
    `

    return reply.status(201).send({ token, expiresAt })
  })

  // GET /sensor/provision — redeem a token and receive client config as .env (public)
  fastify.get('/sensor/provision', async (request, reply) => {
    const parsed = z.object({
      token: z.string().trim().min(1),
    }).safeParse(request.query)

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Missing token' })
    }

    const rows = await fastify.prisma.$queryRaw<Array<{
      id: string
      expires_at: Date
      client_name: string
      client_slug: string
      client_code: string
    }>>`
      SELECT t.id, t.expires_at,
             c.name AS client_name, c.slug AS client_slug, c.code AS client_code
      FROM sensor_provision_tokens t
      JOIN clients c ON c.id = t.client_id
      WHERE t.token = ${parsed.data.token}
      LIMIT 1
    `

    const row = rows[0]
    if (!row) return reply.status(404).send({ error: 'Token not found' })
    if (row.expires_at < new Date()) return reply.status(410).send({ error: 'Token expired' })

    await fastify.prisma.$executeRaw`
      UPDATE sensor_provision_tokens SET used_at = NOW() WHERE id = ${row.id}
    `

    const secret = process.env.INGEST_SHARED_SECRET ?? ''
    const code = row.client_code || row.client_slug.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8)

    const lines = [
      `INGEST_SHARED_SECRET=${secret}`,
      `CLIENT_SLUG=${row.client_slug}`,
      `CLIENT_NAME=${row.client_name}`,
      `SENSOR_ID_SSH=cowrie-01-${code}`,
      `SENSOR_ID_HTTP=web-01-${code}`,
      `SENSOR_ID_FTP=ftp-01-${code}`,
      `SENSOR_ID_MYSQL=mysql-01-${code}`,
      `SENSOR_ID_PORT=port-01-${code}`,
      `SENSOR_ID_DIONAEA=dionaea-01-${code}`,
    ].join('\n')

    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .send(lines)
  })
}
