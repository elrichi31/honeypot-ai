import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  unreadOnly: z.coerce.boolean().default(false),
  clientId: z.string().min(1).optional(),
})

const deleteQuerySchema = z.object({
  clientId: z.string().min(1).optional(),
})

type AlertRow = {
  id: string
  alert_key: string
  level: string
  title: string
  description: string
  fields: unknown
  src_ip: string | null
  sensor_id: string | null
  client_id: string | null
  client_name: string | null
  read_at: Date | null
  created_at: Date
}

export async function alertRoutes(fastify: FastifyInstance) {
  // List recent alerts (optionally scoped to a client), plus the unread count.
  // Includes the client name so the UI can show which tenant each alert is for.
  fastify.get('/alerts', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid query' })
    const { limit, unreadOnly, clientId } = parsed.data

    const rows = await fastify.prisma.$queryRaw<AlertRow[]>`
      SELECT a.id, a.alert_key, a.level, a.title, a.description, a.fields,
             a.src_ip, a.sensor_id, a.client_id, c.name AS client_name,
             a.read_at, a.created_at
      FROM alerts a
      LEFT JOIN clients c ON c.id = a.client_id
      WHERE (${clientId ?? null}::text IS NULL OR a.client_id = ${clientId ?? null})
        AND (${unreadOnly} = false OR a.read_at IS NULL)
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `

    const unreadRows = await fastify.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM alerts
      WHERE read_at IS NULL
        AND (${clientId ?? null}::text IS NULL OR client_id = ${clientId ?? null})
    `
    const unreadCount = Number(unreadRows[0]?.count ?? 0)

    const alerts = rows.map((r) => ({
      id: r.id,
      alertKey: r.alert_key,
      level: r.level,
      title: r.title,
      description: r.description,
      fields: r.fields,
      srcIp: r.src_ip,
      sensorId: r.sensor_id,
      clientId: r.client_id,
      clientName: r.client_name,
      readAt: r.read_at,
      createdAt: r.created_at,
    }))

    return reply.send({ alerts, unreadCount })
  })

  // Mark a single alert as read.
  fastify.post('/alerts/:id/read', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid id' })

    const result = await fastify.prisma.alert.updateMany({
      where: { id: params.data.id, readAt: null },
      data: { readAt: new Date() },
    })
    return reply.send({ updated: result.count })
  })

  // Mark every unread alert (optionally scoped to a client) as read.
  fastify.post('/alerts/read-all', async (request, reply) => {
    const parsed = deleteQuerySchema.safeParse(request.query)
    const clientId = parsed.success ? parsed.data.clientId : undefined
    const result = await fastify.prisma.alert.updateMany({
      where: { readAt: null, ...(clientId ? { clientId } : {}) },
      data: { readAt: new Date() },
    })
    return reply.send({ updated: result.count })
  })

  // Delete every alert, optionally scoped to a client (respects the active
  // client filter so deleting never spills across tenants).
  fastify.delete('/alerts', async (request, reply) => {
    const parsed = deleteQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid query' })
    const { clientId } = parsed.data
    const result = await fastify.prisma.alert.deleteMany({
      where: clientId ? { clientId } : undefined,
    })
    return reply.send({ deleted: result.count })
  })

  // Delete a single alert, optionally constrained to a client scope so a
  // tenant-scoped caller can't delete another client's alert by id.
  fastify.delete('/alerts/:id', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid id' })
    const query = deleteQuerySchema.safeParse(request.query)
    const clientId = query.success ? query.data.clientId : undefined
    const result = await fastify.prisma.alert.deleteMany({
      where: { id: params.data.id, ...(clientId ? { clientId } : {}) },
    })
    return reply.send({ deleted: result.count })
  })
}
