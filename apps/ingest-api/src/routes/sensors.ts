import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'

const heartbeatSchema = z.object({
  sensorId: z.string().min(1),
  name: z.string().min(1),
  protocol: z.enum(['ssh', 'ftp', 'mysql', 'port-scan', 'http']),
  ip: z.string().min(1),
  version: z.string().default(''),
})

export async function sensorRoutes(fastify: FastifyInstance) {
  fastify.post('/sensors/heartbeat', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = heartbeatSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid heartbeat', details: parsed.error.flatten() })
    }

    const d = parsed.data
    const now = new Date()

    await fastify.prisma.$executeRaw`
      INSERT INTO sensors (id, sensor_id, name, protocol, ip, version, last_seen, created_at)
      VALUES (gen_random_uuid()::text, ${d.sensorId}, ${d.name}, ${d.protocol}, ${d.ip}, ${d.version}, ${now}, ${now})
      ON CONFLICT (sensor_id) DO UPDATE SET
        name = EXCLUDED.name,
        protocol = EXCLUDED.protocol,
        ip = EXCLUDED.ip,
        version = EXCLUDED.version,
        last_seen = EXCLUDED.last_seen
    `

    return reply.status(200).send({ ok: true })
  })

  fastify.get('/sensors', async (_request, reply) => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)

    const sensors = await fastify.prisma.$queryRaw<Array<{
      sensor_id: string
      name: string
      protocol: string
      ip: string
      version: string
      last_seen: Date
      created_at: Date
      event_count: bigint
    }>>`
      SELECT
        s.sensor_id,
        s.name,
        s.protocol,
        s.ip,
        s.version,
        s.last_seen,
        s.created_at,
        COALESCE(ph.cnt, 0) AS event_count
      FROM sensors s
      LEFT JOIN (
        SELECT protocol, COUNT(*) AS cnt
        FROM protocol_hits
        GROUP BY protocol
      ) ph ON ph.protocol = s.protocol
      ORDER BY s.last_seen DESC
    `

    const sshStats = await fastify.prisma.$queryRaw<Array<{
      count: bigint
      last_seen: Date | null
    }>>`
      SELECT COUNT(*) AS count, MAX(started_at) AS last_seen
      FROM sessions
    `

    const result = sensors.map(s => ({
      sensorId: s.sensor_id,
      name: s.name,
      protocol: s.protocol,
      ip: s.ip,
      version: s.version,
      lastSeen: s.last_seen,
      createdAt: s.created_at,
      eventsTotal: Number(s.event_count),
      online: s.last_seen > twoMinutesAgo,
    }))

    const ssh = sshStats[0]
    if (ssh && ssh.count > 0n) {
      result.push({
        sensorId: 'cowrie-ssh',
        name: 'SSH Honeypot (Cowrie)',
        protocol: 'ssh',
        ip: '-',
        version: '',
        lastSeen: ssh.last_seen ?? new Date(0),
        createdAt: new Date(0),
        eventsTotal: Number(ssh.count),
        online: ssh.last_seen ? ssh.last_seen > twoMinutesAgo : false,
      })
    }

    return reply.send(result)
  })
}
