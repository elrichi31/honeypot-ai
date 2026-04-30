import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'
import { eventBus } from '../lib/event-bus.js'
import { lookupGeo } from '../lib/geo.js'

const protocolEventSchema = z.object({
  eventId: z.string().uuid(),
  protocol: z.enum(['ftp', 'mysql', 'port-scan']),
  srcIp: z.string().min(1),
  srcPort: z.number().int().nullable().optional(),
  dstPort: z.number().int(),
  eventType: z.enum(['connect', 'auth', 'command']),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  data: z.record(z.unknown()).default({}),
  timestamp: z.string().datetime({ offset: true }),
})

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  protocol: z.string().optional(),
})

export async function protocolRoutes(fastify: FastifyInstance) {
  fastify.post('/ingest/protocol/event', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = protocolEventSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid event', details: parsed.error.flatten() })
    }

    const d = parsed.data

    try {
      const rows = await fastify.prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO protocol_hits (
          event_id, protocol, src_ip, src_port, dst_port,
          event_type, username, password, data, timestamp
        ) VALUES (
          ${d.eventId}, ${d.protocol}, ${d.srcIp},
          ${d.srcPort ?? null}::int, ${d.dstPort},
          ${d.eventType}, ${d.username ?? null}, ${d.password ?? null},
          CAST(${JSON.stringify(d.data)} AS jsonb), ${new Date(d.timestamp)}
        )
        ON CONFLICT (event_id) DO NOTHING
        RETURNING id
      `

      if (rows[0]) {
        const geo = lookupGeo(d.srcIp)
        if (geo) {
          eventBus.emit('attack', {
            type: d.protocol as 'ftp' | 'mysql' | 'port-scan',
            ip: d.srcIp,
            ...geo,
            timestamp: d.timestamp,
          })
        }
        return reply.status(201).send({ id: rows[0].id })
      }

      return reply.status(200).send({ duplicate: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(500).send({ error: msg })
    }
  })

  fastify.get('/protocol-hits', async (request, reply) => {
    const q = listQuerySchema.parse(request.query)
    const offset = (q.page - 1) * q.limit

    const [rows, countRows] = await Promise.all([
      fastify.prisma.$queryRaw<Array<{
        id: string; protocol: string; src_ip: string; src_port: number | null;
        dst_port: number; event_type: string; username: string | null; timestamp: Date;
      }>>`
        SELECT id, protocol, src_ip, src_port, dst_port, event_type, username, timestamp
        FROM protocol_hits
        WHERE (${q.protocol ?? null}::text IS NULL OR protocol = ${q.protocol ?? null})
        ORDER BY timestamp DESC
        LIMIT ${q.limit} OFFSET ${offset}
      `,
      fastify.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) FROM protocol_hits
        WHERE (${q.protocol ?? null}::text IS NULL OR protocol = ${q.protocol ?? null})
      `,
    ])

    return reply.send({
      data: rows,
      meta: { page: q.page, limit: q.limit, total: Number(countRows[0]?.count ?? 0) },
    })
  })

  fastify.get('/protocol-hits/stats', async (_request, reply) => {
    const rows = await fastify.prisma.$queryRaw<Array<{
      protocol: string; count: bigint; last_seen: Date; auth_attempts: bigint;
    }>>`
      SELECT
        protocol,
        COUNT(*) AS count,
        MAX(timestamp) AS last_seen,
        COUNT(*) FILTER (WHERE event_type = 'auth') AS auth_attempts
      FROM protocol_hits
      GROUP BY protocol
      ORDER BY count DESC
    `

    return reply.send(rows.map(r => ({
      protocol: r.protocol,
      count: Number(r.count),
      lastSeen: r.last_seen,
      authAttempts: Number(r.auth_attempts),
    })))
  })
}
