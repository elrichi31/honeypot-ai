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

const insightsQuerySchema = z.object({
  protocol: z.enum(['ftp', 'mysql', 'port-scan']),
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
            dstPort: d.dstPort,
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
        dst_port: number; event_type: string; username: string | null; password: string | null; data: unknown; timestamp: Date;
      }>>`
        SELECT id, protocol, src_ip, src_port, dst_port, event_type, username, password, data, timestamp
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

  fastify.get('/protocol-hits/insights', async (request, reply) => {
    const q = insightsQuerySchema.parse(request.query)

    const [totals, topIps, topPorts, topUsernames, topPasswords, topCommands, topServices, topDatabases] = await Promise.all([
      fastify.prisma.$queryRaw<Array<{
        total: number; unique_ips: number; auth_attempts: number; command_events: number; last_seen: Date | null;
      }>>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(DISTINCT src_ip)::int AS unique_ips,
          COUNT(*) FILTER (WHERE event_type = 'auth')::int AS auth_attempts,
          COUNT(*) FILTER (WHERE event_type = 'command')::int AS command_events,
          MAX(timestamp) AS last_seen
        FROM protocol_hits
        WHERE protocol = ${q.protocol}
      `,
      fastify.prisma.$queryRaw<Array<{ src_ip: string; count: number; last_seen: Date }>>`
        SELECT src_ip, COUNT(*)::int AS count, MAX(timestamp) AS last_seen
        FROM protocol_hits
        WHERE protocol = ${q.protocol}
        GROUP BY src_ip
        ORDER BY count DESC, last_seen DESC
        LIMIT 10
      `,
      fastify.prisma.$queryRaw<Array<{ dst_port: number; count: number; last_seen: Date }>>`
        SELECT dst_port, COUNT(*)::int AS count, MAX(timestamp) AS last_seen
        FROM protocol_hits
        WHERE protocol = ${q.protocol}
        GROUP BY dst_port
        ORDER BY count DESC, last_seen DESC
        LIMIT 10
      `,
      fastify.prisma.$queryRaw<Array<{ username: string; count: number }>>`
        SELECT username, COUNT(*)::int AS count
        FROM protocol_hits
        WHERE protocol = ${q.protocol} AND username IS NOT NULL AND username <> ''
        GROUP BY username
        ORDER BY count DESC
        LIMIT 10
      `,
      fastify.prisma.$queryRaw<Array<{ password: string; count: number }>>`
        SELECT password, COUNT(*)::int AS count
        FROM protocol_hits
        WHERE protocol = ${q.protocol} AND password IS NOT NULL AND password <> ''
        GROUP BY password
        ORDER BY count DESC
        LIMIT 10
      `,
      fastify.prisma.$queryRaw<Array<{ command: string; count: number }>>`
        SELECT data->>'command' AS command, COUNT(*)::int AS count
        FROM protocol_hits
        WHERE protocol = ${q.protocol} AND data ? 'command' AND data->>'command' <> ''
        GROUP BY data->>'command'
        ORDER BY count DESC
        LIMIT 10
      `,
      fastify.prisma.$queryRaw<Array<{ service: string; count: number }>>`
        SELECT data->>'service' AS service, COUNT(*)::int AS count
        FROM protocol_hits
        WHERE protocol = ${q.protocol} AND data ? 'service' AND data->>'service' <> ''
        GROUP BY data->>'service'
        ORDER BY count DESC
        LIMIT 10
      `,
      fastify.prisma.$queryRaw<Array<{ database: string; count: number }>>`
        SELECT data->>'database' AS database, COUNT(*)::int AS count
        FROM protocol_hits
        WHERE protocol = ${q.protocol} AND data ? 'database' AND data->>'database' <> ''
        GROUP BY data->>'database'
        ORDER BY count DESC
        LIMIT 10
      `,
    ])

    const total = totals[0]

    return reply.send({
      totals: {
        total: total?.total ?? 0,
        uniqueIps: total?.unique_ips ?? 0,
        authAttempts: total?.auth_attempts ?? 0,
        commandEvents: total?.command_events ?? 0,
        lastSeen: total?.last_seen ?? null,
      },
      topIps: topIps.map(r => ({ srcIp: r.src_ip, count: r.count, lastSeen: r.last_seen })),
      topPorts: topPorts.map(r => ({ dstPort: r.dst_port, count: r.count, lastSeen: r.last_seen })),
      topUsernames,
      topPasswords,
      topCommands,
      topServices,
      topDatabases,
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

  fastify.get('/protocol-hits/ports/stats', async (_request, reply) => {
    const rows = await fastify.prisma.$queryRaw<Array<{
      protocol: string; dst_port: number; count: bigint; last_seen: Date; auth_attempts: bigint;
    }>>`
      SELECT
        protocol,
        dst_port,
        COUNT(*) AS count,
        MAX(timestamp) AS last_seen,
        COUNT(*) FILTER (WHERE event_type = 'auth') AS auth_attempts
      FROM protocol_hits
      GROUP BY protocol, dst_port
      ORDER BY count DESC, last_seen DESC
      LIMIT 50
    `

    return reply.send(rows.map(r => ({
      protocol: r.protocol,
      dstPort: r.dst_port,
      count: Number(r.count),
      lastSeen: r.last_seen,
      authAttempts: Number(r.auth_attempts),
    })))
  })
}
