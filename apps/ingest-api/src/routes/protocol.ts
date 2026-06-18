import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withCache } from '../lib/cache-helper.js'
import { ensureIngestToken } from '../lib/ingest-auth.js'
import { eventBus } from '../lib/event-bus.js'
import { lookupGeo } from '../lib/geo.js'
import { scheduleThreatAlert, evaluateDeceptionAlert } from '../lib/threat-alerts.js'
import { forwardClientEventBySensorId } from '../lib/client-forward.js'
import { enqueueProtocolHit } from '../lib/protocol-batch.js'

const protocolEventSchema = z.object({
  eventId: z.string().uuid(),
  sensorId: z.string().min(1).optional(),
  protocol: z.string().min(1),
  srcIp: z.string().min(1),
  srcPort: z.number().int().nullable().optional(),
  dstPort: z.number().int(),
  eventType: z.enum(['connect', 'auth', 'command', 'file.upload', 'file.download']),
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
  protocol: z.string().min(1),
})

export async function protocolRoutes(fastify: FastifyInstance) {
  fastify.post('/ingest/protocol/event', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = protocolEventSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid event', details: parsed.error.flatten() })
    }

    const d = parsed.data
    const sensorId = d.sensorId ?? (typeof d.data?.sensor === 'string' ? d.data.sensor : null)

    const id = enqueueProtocolHit({
      eventId:   d.eventId,
      sensorId:  sensorId ?? null,
      protocol:  d.protocol,
      srcIp:     d.srcIp,
      srcPort:   d.srcPort ?? null,
      dstPort:   d.dstPort,
      eventType: d.eventType,
      username:  d.username ?? null,
      password:  d.password ?? null,
      data:      d.data as Record<string, unknown>,
      timestamp: new Date(d.timestamp),
    })

    const geo = lookupGeo(d.srcIp)
    if (geo) {
      eventBus.emit('attack', {
        type: d.protocol,
        ip: d.srcIp,
        ...geo,
        timestamp: d.timestamp,
        dstPort: d.dstPort,
      })
    }
    void forwardClientEventBySensorId(fastify.prisma, sensorId, {
      kind: 'protocol.event',
      event: {
        eventId: d.eventId,
        sensorId,
        protocol: d.protocol,
        srcIp: d.srcIp,
        srcPort: d.srcPort ?? null,
        dstPort: d.dstPort,
        eventType: d.eventType,
        username: d.username ?? null,
        password: d.password ?? null,
        data: d.data,
        timestamp: d.timestamp,
      },
    })
    scheduleThreatAlert(fastify.prisma, d.srcIp)

    // Deception (OpenCanary) nodes: any interaction means lateral movement past
    // cowrie — fire a critical alert immediately (best-effort, non-blocking).
    if (d.data?.source === 'opencanary') {
      const nodeId = typeof d.data.node_id === 'string' ? d.data.node_id : (sensorId ?? 'unknown')
      void evaluateDeceptionAlert(fastify.prisma, {
        internalIp: d.srcIp,
        nodeId,
        protocol: d.protocol,
        eventType: d.eventType,
        timestamp: new Date(d.timestamp),
        username: d.username ?? null,
        password: d.password ?? null,
      })
    }

    return reply.status(201).send({ id })
  })

  fastify.get('/protocol-hits', async (request, reply) => {
    const q = listQuerySchema.parse(request.query)
    const offset = (q.page - 1) * q.limit

    const [rows, countRows] = await Promise.all([
      fastify.prismaRead.$queryRaw<Array<{
        id: string; protocol: string; src_ip: string; src_port: number | null;
        dst_port: number; event_type: string; username: string | null; password: string | null; data: unknown; timestamp: Date;
      }>>`
        SELECT id, protocol, src_ip, src_port, dst_port, event_type, username, password, data, timestamp
        FROM protocol_hits
        WHERE (${q.protocol ?? null}::text IS NULL OR protocol = ${q.protocol ?? null})
        ORDER BY timestamp DESC
        LIMIT ${q.limit} OFFSET ${offset}
      `,
      fastify.prismaRead.$queryRaw<[{ count: bigint }]>`
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

    const cacheKey = `protocol-insights:${q.protocol}`
    return reply.send(await withCache(fastify.cache, cacheKey, 1800, async () => {
    const isSmb = q.protocol === 'smb'

    const [totals, topIps, topPorts, topUsernames, topPasswords, topCommands, topServices, topDatabases, topDomains, topShares, topNativeOS, topNtlmHashes, eventBreakdown, topCredentials] = await Promise.all([
      fastify.prismaRead.$queryRaw<Array<{
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
      fastify.prismaRead.$queryRaw<Array<{ src_ip: string; count: number; last_seen: Date }>>`
        SELECT src_ip, COUNT(*)::int AS count, MAX(timestamp) AS last_seen
        FROM protocol_hits
        WHERE protocol = ${q.protocol}
        GROUP BY src_ip
        ORDER BY count DESC, last_seen DESC
        LIMIT 10
      `,
      fastify.prismaRead.$queryRaw<Array<{ dst_port: number; count: number; last_seen: Date }>>`
        SELECT dst_port, COUNT(*)::int AS count, MAX(timestamp) AS last_seen
        FROM protocol_hits
        WHERE protocol = ${q.protocol}
        GROUP BY dst_port
        ORDER BY count DESC, last_seen DESC
        LIMIT 10
      `,
      fastify.prismaRead.$queryRaw<Array<{ username: string; count: number }>>`
        SELECT username, COUNT(*)::int AS count
        FROM protocol_hits
        WHERE protocol = ${q.protocol} AND username IS NOT NULL AND username <> ''
        GROUP BY username
        ORDER BY count DESC
        LIMIT 10
      `,
      fastify.prismaRead.$queryRaw<Array<{ password: string; count: number }>>`
        SELECT password, COUNT(*)::int AS count
        FROM protocol_hits
        WHERE protocol = ${q.protocol} AND password IS NOT NULL AND password <> ''
        GROUP BY password
        ORDER BY count DESC
        LIMIT 10
      `,
      fastify.prismaRead.$queryRaw<Array<{ command: string; count: number }>>`
        SELECT data->>'command' AS command, COUNT(*)::int AS count
        FROM protocol_hits
        WHERE protocol = ${q.protocol} AND data ? 'command' AND data->>'command' <> ''
        GROUP BY data->>'command'
        ORDER BY count DESC
        LIMIT 10
      `,
      fastify.prismaRead.$queryRaw<Array<{ service: string; count: number }>>`
        SELECT data->>'service' AS service, COUNT(*)::int AS count
        FROM protocol_hits
        WHERE protocol = ${q.protocol} AND data ? 'service' AND data->>'service' <> ''
        GROUP BY data->>'service'
        ORDER BY count DESC
        LIMIT 10
      `,
      fastify.prismaRead.$queryRaw<Array<{ database: string; count: number }>>`
        SELECT data->>'database' AS database, COUNT(*)::int AS count
        FROM protocol_hits
        WHERE protocol = ${q.protocol} AND data ? 'database' AND data->>'database' <> ''
        GROUP BY data->>'database'
        ORDER BY count DESC
        LIMIT 10
      `,
      // SMB-specific: NTLM domain/workgroup
      isSmb
        ? fastify.prismaRead.$queryRaw<Array<{ domain: string; count: number }>>`
            SELECT data->>'domain' AS domain, COUNT(*)::int AS count
            FROM protocol_hits
            WHERE protocol = 'smb' AND data->>'domain' IS NOT NULL AND data->>'domain' <> ''
            GROUP BY data->>'domain'
            ORDER BY count DESC
            LIMIT 10
          `
        : Promise.resolve([]),
      // SMB-specific: accessed shares
      isSmb
        ? fastify.prismaRead.$queryRaw<Array<{ share: string; count: number }>>`
            SELECT data->>'share' AS share, COUNT(*)::int AS count
            FROM protocol_hits
            WHERE protocol = 'smb' AND data->>'share' IS NOT NULL AND data->>'share' <> ''
            GROUP BY data->>'share'
            ORDER BY count DESC
            LIMIT 10
          `
        : Promise.resolve([]),
      // SMB-specific: NativeOS fingerprint of attacking host
      isSmb
        ? fastify.prismaRead.$queryRaw<Array<{ native_os: string; count: number }>>`
            SELECT data->>'nativeOS' AS native_os, COUNT(*)::int AS count
            FROM protocol_hits
            WHERE protocol = 'smb' AND data->>'nativeOS' IS NOT NULL AND data->>'nativeOS' <> ''
            GROUP BY data->>'nativeOS'
            ORDER BY count DESC
            LIMIT 10
          `
        : Promise.resolve([]),
      // SMB-specific: top NTLM hashes (first 32 chars shown — enough for hashcat)
      isSmb
        ? fastify.prismaRead.$queryRaw<Array<{ ntlm_hash: string; username: string; count: number }>>`
            SELECT
              LEFT(data->>'ntlmHash', 32) AS ntlm_hash,
              username,
              COUNT(*)::int AS count
            FROM protocol_hits
            WHERE protocol = 'smb'
              AND data->>'ntlmHash' IS NOT NULL
              AND data->>'ntlmHash' <> ''
            GROUP BY LEFT(data->>'ntlmHash', 32), username
            ORDER BY count DESC
            LIMIT 10
          `
        : Promise.resolve([]),
      // Event-type breakdown (connect / auth / command / file.upload / file.download)
      fastify.prismaRead.$queryRaw<Array<{ event_type: string; count: number }>>`
        SELECT event_type, COUNT(*)::int AS count
        FROM protocol_hits
        WHERE protocol = ${q.protocol}
        GROUP BY event_type
        ORDER BY count DESC
      `,
      // Credential pairs actually tried together (more useful than separate lists)
      fastify.prismaRead.$queryRaw<Array<{ username: string; password: string; count: number }>>`
        SELECT username, password, COUNT(*)::int AS count
        FROM protocol_hits
        WHERE protocol = ${q.protocol} AND event_type = 'auth'
          AND username IS NOT NULL AND password IS NOT NULL AND password <> ''
        GROUP BY username, password
        ORDER BY count DESC
        LIMIT 12
      `,
    ])

    const total = totals[0]

      return {
        totals: { total: total?.total ?? 0, uniqueIps: total?.unique_ips ?? 0, authAttempts: total?.auth_attempts ?? 0, commandEvents: total?.command_events ?? 0, lastSeen: total?.last_seen ?? null },
        topIps: topIps.map(r => ({ srcIp: r.src_ip, count: r.count, lastSeen: r.last_seen })),
        topPorts: topPorts.map(r => ({ dstPort: r.dst_port, count: r.count, lastSeen: r.last_seen })),
        topUsernames, topPasswords, topCommands, topServices, topDatabases,
        topDomains:    (topDomains    as Array<{ domain: string; count: number }>).map(r => ({ domain: r.domain, count: r.count })),
        topShares:     (topShares     as Array<{ share: string; count: number }>).map(r => ({ share: r.share, count: r.count })),
        topNativeOS:   (topNativeOS   as Array<{ native_os: string; count: number }>).map(r => ({ nativeOS: r.native_os, count: r.count })),
        topNtlmHashes: (topNtlmHashes as Array<{ ntlm_hash: string; username: string; count: number }>).map(r => ({ ntlmHash: r.ntlm_hash, username: r.username, count: r.count })),
        eventBreakdown: eventBreakdown.map(r => ({ eventType: r.event_type, count: r.count })),
        topCredentials: topCredentials.map(r => ({ username: r.username, password: r.password, count: r.count })),
      }
    }))
  })

  fastify.get('/protocol-hits/stats', (_request, reply) =>
    withCache(fastify.cache, 'protocol-hits:stats', 1800, async () => {
      const rows = await fastify.prismaRead.$queryRaw<Array<{ protocol: string; count: bigint; last_seen: Date; auth_attempts: bigint }>>`
        SELECT protocol, COUNT(*) AS count, MAX(timestamp) AS last_seen,
               COUNT(*) FILTER (WHERE event_type = 'auth') AS auth_attempts
        FROM protocol_hits
        WHERE timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY protocol ORDER BY count DESC
      `
      return rows.map(r => ({ protocol: r.protocol, count: Number(r.count), lastSeen: r.last_seen, authAttempts: Number(r.auth_attempts) }))
    }).then(result => reply.send(result))
  )

  fastify.get('/protocol-hits/ports/stats', (_request, reply) =>
    withCache(fastify.cache, 'protocol-hits:ports-stats', 1800, async () => {
      const rows = await fastify.prismaRead.$queryRaw<Array<{ protocol: string; dst_port: number; count: bigint; last_seen: Date; auth_attempts: bigint }>>`
        SELECT protocol, dst_port, COUNT(*) AS count, MAX(timestamp) AS last_seen,
               COUNT(*) FILTER (WHERE event_type = 'auth') AS auth_attempts
        FROM protocol_hits
        WHERE timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY protocol, dst_port ORDER BY count DESC, last_seen DESC LIMIT 50
      `
      return rows.map(r => ({ protocol: r.protocol, dstPort: r.dst_port, count: Number(r.count), lastSeen: r.last_seen, authAttempts: Number(r.auth_attempts) }))
    }).then(result => reply.send(result))
  )
}
