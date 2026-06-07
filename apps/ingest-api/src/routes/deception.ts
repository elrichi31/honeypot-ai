import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withCache } from '../lib/cache-helper.js'

// All deception (OpenCanary) events arrive as protocol_hits tagged with
// data.source = 'opencanary'. The node that was touched is data->>'node_id'.
// Attackers reach these nodes from *inside* cowrie, so the protocol_hit's src_ip
// is cowrie's internal address (10.0.1.100), not the real attacker. We attribute
// the public IP best-effort by matching the event time to an active cowrie
// session window.
const DECEPTION_FILTER = `data->>'source' = 'opencanary'`

// How long after a cowrie session's start we still consider a deception event to
// belong to it when ended_at is null (open/abandoned session).
const SESSION_FALLBACK_WINDOW = `interval '2 hours'`

// A cowrie session correlated to a deception event by time overlap. The match is
// "probable" (an IP can have overlapping sessions), never presented as certain.
type KillChainStepRow = {
  node_id: string | null
  protocol: string
  dst_port: number
  event_type: string
  username: string | null
  password: string | null
  timestamp: Date
  public_ip: string | null
  session_id: string | null
  logdata: unknown
}

export async function deceptionRoutes(fastify: FastifyInstance) {
  // ── Overview cards ──────────────────────────────────────────────────────
  fastify.get('/deception/overview', (_request, reply) =>
    withCache(fastify.cache, 'deception:overview', 30, async () => {
      const [nodes, activity] = await Promise.all([
        fastify.prisma.$queryRaw<Array<{ total: bigint; online: bigint }>>`
          SELECT
            COUNT(*)::bigint AS total,
            COUNT(*) FILTER (WHERE last_seen >= NOW() - INTERVAL '2 minutes')::bigint AS online
          FROM sensors
          WHERE protocol = 'deception'
        `,
        fastify.prisma.$queryRawUnsafe<Array<{
          hits_24h: bigint; hits_7d: bigint; auth_24h: bigint;
          unique_internal_ips: bigint; last_event: Date | null;
        }>>(`
          SELECT
            COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours')::bigint AS hits_24h,
            COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '7 days')::bigint  AS hits_7d,
            COUNT(*) FILTER (WHERE event_type = 'auth' AND timestamp >= NOW() - INTERVAL '24 hours')::bigint AS auth_24h,
            COUNT(DISTINCT src_ip)::bigint AS unique_internal_ips,
            MAX(timestamp) AS last_event
          FROM protocol_hits
          WHERE ${DECEPTION_FILTER}
        `),
      ])

      const n = nodes[0]
      const a = activity[0]
      return {
        nodesTotal: Number(n?.total ?? 0),
        nodesOnline: Number(n?.online ?? 0),
        hits24h: Number(a?.hits_24h ?? 0),
        hits7d: Number(a?.hits_7d ?? 0),
        authAttempts24h: Number(a?.auth_24h ?? 0),
        uniqueInternalIps: Number(a?.unique_internal_ips ?? 0),
        lastEvent: a?.last_event ?? null,
      }
    }).then(reply.send.bind(reply))
  )

  // ── Per-node status + activity ──────────────────────────────────────────
  fastify.get('/deception/nodes', (_request, reply) =>
    withCache(fastify.cache, 'deception:nodes', 30, async () => {
      // Registered deception sensors (source of truth for node identity + online).
      const sensors = await fastify.prisma.$queryRaw<Array<{
        sensor_id: string; name: string; ip: string; ports: unknown; last_seen: Date;
      }>>`
        SELECT sensor_id, name, ip, ports, last_seen
        FROM sensors
        WHERE protocol = 'deception'
        ORDER BY ip ASC
      `

      // Activity grouped by node_id from the protocol_hits feed.
      const activity = await fastify.prisma.$queryRawUnsafe<Array<{
        node_id: string; hits: bigint; auth_attempts: bigint; last_hit: Date | null;
      }>>(`
        SELECT
          data->>'node_id' AS node_id,
          COUNT(*)::bigint AS hits,
          COUNT(*) FILTER (WHERE event_type = 'auth')::bigint AS auth_attempts,
          MAX(timestamp) AS last_hit
        FROM protocol_hits
        WHERE ${DECEPTION_FILTER} AND data->>'node_id' IS NOT NULL
        GROUP BY data->>'node_id'
      `)

      const byNode = new Map(activity.map(r => [r.node_id, r]))
      const now = Date.now()
      return sensors.map(s => {
        // sensor_id is "opencanary-<node>"; node_id in events matches that.
        const act = byNode.get(s.sensor_id)
        return {
          sensorId: s.sensor_id,
          name: s.name,
          ip: s.ip,
          ports: Array.isArray(s.ports) ? s.ports : [],
          online: now - new Date(s.last_seen).getTime() < 2 * 60 * 1000,
          lastSeen: s.last_seen,
          hits: Number(act?.hits ?? 0),
          authAttempts: Number(act?.auth_attempts ?? 0),
          lastHit: act?.last_hit ?? null,
        }
      })
    }).then(reply.send.bind(reply))
  )

  // ── Kill-chain: deception steps grouped by correlated cowrie session ────
  fastify.get('/deception/killchain', (request, reply) => {
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(200),
    }).parse(request.query)

    return withCache(fastify.cache, `deception:killchain:${q.limit}`, 30, async () => {
      // Pull recent deception steps, attributing the public IP + cowrie session
      // best-effort via a time-overlap LATERAL join. A session matches when the
      // event falls within [started_at, ended_at|started_at+2h]. Most recent
      // matching session wins.
      const steps = await fastify.prisma.$queryRawUnsafe<KillChainStepRow[]>(`
        SELECT
          ph.data->>'node_id' AS node_id,
          ph.protocol,
          ph.dst_port,
          ph.event_type,
          ph.username,
          ph.password,
          ph.timestamp,
          ph.data->'logdata' AS logdata,
          s.src_ip AS public_ip,
          s.id     AS session_id
        FROM protocol_hits ph
        LEFT JOIN LATERAL (
          SELECT s.id, s.src_ip
          FROM sessions s
          WHERE ph.timestamp >= s.started_at
            AND ph.timestamp <= COALESCE(s.ended_at, s.started_at + ${SESSION_FALLBACK_WINDOW})
          ORDER BY s.started_at DESC
          LIMIT 1
        ) s ON true
        WHERE ${DECEPTION_FILTER}
        ORDER BY ph.timestamp DESC
        LIMIT ${q.limit}
      `)

      // Group into chains. Key by correlated session when present, else by the
      // internal-only bucket so unattributed activity still shows up.
      type Chain = {
        key: string
        publicIp: string | null
        sessionId: string | null
        correlation: 'probable' | 'none'
        firstSeen: Date
        lastSeen: Date
        steps: Array<{
          nodeId: string | null; protocol: string; dstPort: number;
          eventType: string; username: string | null; password: string | null;
          timestamp: Date; logdata: unknown;
        }>
      }
      const chains = new Map<string, Chain>()

      // steps come newest-first; iterate oldest-first so each chain's steps are chronological.
      for (const row of [...steps].reverse()) {
        const key = row.session_id ?? `internal:${row.public_ip ?? 'unknown'}`
        let chain = chains.get(key)
        if (!chain) {
          chain = {
            key,
            publicIp: row.public_ip,
            sessionId: row.session_id,
            correlation: row.session_id ? 'probable' : 'none',
            firstSeen: row.timestamp,
            lastSeen: row.timestamp,
            steps: [],
          }
          chains.set(key, chain)
        }
        chain.lastSeen = row.timestamp
        chain.steps.push({
          nodeId: row.node_id,
          protocol: row.protocol,
          dstPort: row.dst_port,
          eventType: row.event_type,
          username: row.username,
          password: row.password,
          timestamp: row.timestamp,
          logdata: row.logdata,
        })
      }

      return [...chains.values()]
        .map(c => ({
          ...c,
          nodesTouched: new Set(c.steps.map(s => s.nodeId).filter(Boolean)).size,
          durationSec: Math.max(0, Math.round((new Date(c.lastSeen).getTime() - new Date(c.firstSeen).getTime()) / 1000)),
        }))
        .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    }).then(reply.send.bind(reply))
  })

  // ── Raw event feed (drill-down) ─────────────────────────────────────────
  fastify.get('/deception/events', async (request, reply) => {
    const q = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      nodeId: z.string().optional(),
    }).parse(request.query)
    const offset = (q.page - 1) * q.limit

    const [rows, countRows] = await Promise.all([
      fastify.prisma.$queryRawUnsafe<Array<{
        id: string; node_id: string | null; protocol: string; src_ip: string;
        src_port: number | null; dst_port: number; event_type: string;
        username: string | null; password: string | null; timestamp: Date;
        logtype: number | null; logdata: unknown; dst_host: string | null;
      }>>(`
        SELECT id, data->>'node_id' AS node_id, protocol, src_ip, src_port, dst_port,
               event_type, username, password, timestamp,
               (data->>'logtype')::int AS logtype,
               data->'logdata'         AS logdata,
               data->>'dst_host'       AS dst_host
        FROM protocol_hits
        WHERE ${DECEPTION_FILTER}
          AND ($1::text IS NULL OR data->>'node_id' = $1)
        ORDER BY timestamp DESC
        LIMIT $2 OFFSET $3
      `, q.nodeId ?? null, q.limit, offset),
      fastify.prisma.$queryRawUnsafe<[{ count: bigint }]>(`
        SELECT COUNT(*) FROM protocol_hits
        WHERE ${DECEPTION_FILTER}
          AND ($1::text IS NULL OR data->>'node_id' = $1)
      `, q.nodeId ?? null),
    ])

    return reply.send({
      data: rows,
      meta: { page: q.page, limit: q.limit, total: Number(countRows[0]?.count ?? 0) },
    })
  })
}
