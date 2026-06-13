import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withCache } from '../lib/cache-helper.js'
import { resolveClientSensors } from '../lib/client-helpers.js'

// All deception (OpenCanary) events arrive as protocol_hits tagged with
// data.source = 'opencanary'. The node that was touched is data->>'node_id'
// (which equals the per-client sensor_id, e.g. opencanary-fake-db-<slug>).
// Attackers reach these nodes from *inside* cowrie, so the protocol_hit's src_ip
// is cowrie's internal address (10.0.1.100), not the real attacker. We attribute
// the public IP best-effort by matching the event time to an active cowrie
// session window.
const DECEPTION_FILTER = `data->>'source' = 'opencanary'`

// How long after a cowrie session's start we still consider a deception event to
// belong to it when ended_at is null (open/abandoned session).
const SESSION_FALLBACK_WINDOW = `interval '2 hours'`

// Optional per-client scope. When set, queries are restricted to the client's
// sensors; when null, they aggregate across all clients (the global view).
type Scope = { clientId: string; sensorIds: string[] } | null

// Restrict protocol_hits to a client's sensors. Uses a single array bind
// (`col = ANY($n::text[])`) so the param count is fixed at exactly one regardless
// of how many sensors the client has — no dynamic placeholder arithmetic. `index`
// is that one placeholder's position; `col` is the (possibly aliased) sensor_id
// column. When there are zero sensors, matches nothing so an empty client shows
// empty. Global scope (null) adds no clause and no param.
function sensorScopeClause(
  scope: Scope,
  index: number,
  col = 'sensor_id',
): { clause: string; params: unknown[] } {
  if (!scope) return { clause: '', params: [] }
  if (scope.sensorIds.length === 0) return { clause: ' AND false', params: [] }
  return { clause: ` AND ${col} = ANY($${index}::text[])`, params: [scope.sensorIds] }
}

type KillChainStepRow = {
  node_id: string | null
  node_name: string | null
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

// ── Query bodies (shared by global + per-client routes) ───────────────────────

async function queryOverview(fastify: FastifyInstance, scope: Scope) {
  const nodeWhere = scope ? `protocol = 'deception' AND client_id = $1` : `protocol = 'deception'`
  const nodeParams = scope ? [scope.clientId] : []
  const hitScope = sensorScopeClause(scope, 1)

  const [nodes, activity] = await Promise.all([
    fastify.prismaRead.$queryRawUnsafe<Array<{ total: bigint; online: bigint }>>(`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE last_seen >= NOW() - INTERVAL '2 minutes')::bigint AS online
      FROM sensors
      WHERE ${nodeWhere}
    `, ...nodeParams),
    fastify.prismaRead.$queryRawUnsafe<Array<{
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
      WHERE ${DECEPTION_FILTER}${hitScope.clause}
    `, ...hitScope.params),
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
}

async function queryNodes(fastify: FastifyInstance, scope: Scope) {
  const sensorWhere = scope ? `protocol = 'deception' AND client_id = $1` : `protocol = 'deception'`
  const sensorParams = scope ? [scope.clientId] : []
  const hitScope = sensorScopeClause(scope, 1)

  // Registered deception sensors (source of truth for node identity + online).
  const sensors = await fastify.prismaRead.$queryRawUnsafe<Array<{
    sensor_id: string; name: string; ip: string; ports: unknown; last_seen: Date;
  }>>(`
    SELECT sensor_id, name, ip, ports, last_seen
    FROM sensors
    WHERE ${sensorWhere}
    ORDER BY ip ASC
  `, ...sensorParams)

  // Activity grouped by node_id (== sensor_id) from the protocol_hits feed.
  const activity = await fastify.prismaRead.$queryRawUnsafe<Array<{
    node_id: string; hits: bigint; auth_attempts: bigint; last_hit: Date | null;
  }>>(`
    SELECT
      data->>'node_id' AS node_id,
      COUNT(*)::bigint AS hits,
      COUNT(*) FILTER (WHERE event_type = 'auth')::bigint AS auth_attempts,
      MAX(timestamp) AS last_hit
    FROM protocol_hits
    WHERE ${DECEPTION_FILTER} AND data->>'node_id' IS NOT NULL${hitScope.clause}
    GROUP BY data->>'node_id'
  `, ...hitScope.params)

  const byNode = new Map(activity.map(r => [r.node_id, r]))
  const now = Date.now()
  return sensors.map(s => {
    // data->>'node_id' in events equals the sensor_id.
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
}

async function queryKillchain(fastify: FastifyInstance, scope: Scope, limit: number) {
  // limit is a validated integer; sensor params follow it.
  const hitScope = sensorScopeClause(scope, 2, 'ph.sensor_id')
  const steps = await fastify.prismaRead.$queryRawUnsafe<KillChainStepRow[]>(`
    SELECT
      ph.data->>'node_id' AS node_id,
      sn.name             AS node_name,
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
    LEFT JOIN sensors sn ON sn.sensor_id = ph.data->>'node_id'
    LEFT JOIN LATERAL (
      SELECT s.id, s.src_ip
      FROM sessions s
      WHERE ph.timestamp >= s.started_at
        AND ph.timestamp <= COALESCE(s.ended_at, s.started_at + ${SESSION_FALLBACK_WINDOW})
      ORDER BY s.started_at DESC
      LIMIT 1
    ) s ON true
    WHERE ${DECEPTION_FILTER}${hitScope.clause}
    ORDER BY ph.timestamp DESC
    LIMIT $1
  `, limit, ...hitScope.params)

  type Chain = {
    key: string
    publicIp: string | null
    sessionId: string | null
    correlation: 'probable' | 'none'
    firstSeen: Date
    lastSeen: Date
    steps: Array<{
      nodeId: string | null; nodeName: string | null; protocol: string; dstPort: number;
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
      nodeName: row.node_name,
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
}

async function queryEvents(
  fastify: FastifyInstance,
  scope: Scope,
  page: number,
  limit: number,
  nodeId: string | null,
) {
  const offset = (page - 1) * limit
  // Fixed params: $1 nodeId, $2 limit, $3 offset; the optional sensor scope is a
  // single array bind at $4 (positions never shift, so no placeholder math).
  const rowsScope = sensorScopeClause(scope, 4, 'ph.sensor_id')
  const countScope = sensorScopeClause(scope, 2, 'sensor_id')

  const [rows, countRows] = await Promise.all([
    fastify.prismaRead.$queryRawUnsafe<Array<{
      id: string; node_id: string | null; node_name: string | null; protocol: string;
      src_ip: string; src_port: number | null; dst_port: number; event_type: string;
      username: string | null; password: string | null; timestamp: Date;
      logtype: number | null; logdata: unknown; dst_host: string | null;
    }>>(`
      SELECT ph.id, ph.data->>'node_id' AS node_id, sn.name AS node_name, ph.protocol,
             ph.src_ip, ph.src_port, ph.dst_port,
             ph.event_type, ph.username, ph.password, ph.timestamp,
             (ph.data->>'logtype')::int AS logtype,
             ph.data->'logdata'         AS logdata,
             ph.data->>'dst_host'       AS dst_host
      FROM protocol_hits ph
      LEFT JOIN sensors sn ON sn.sensor_id = ph.data->>'node_id'
      WHERE ${DECEPTION_FILTER} AND ($1::text IS NULL OR ph.data->>'node_id' = $1)${rowsScope.clause}
      ORDER BY ph.timestamp DESC
      LIMIT $2 OFFSET $3
    `, nodeId, limit, offset, ...rowsScope.params),
    fastify.prismaRead.$queryRawUnsafe<[{ count: bigint }]>(`
      SELECT COUNT(*) FROM protocol_hits
      WHERE ${DECEPTION_FILTER} AND ($1::text IS NULL OR data->>'node_id' = $1)${countScope.clause}
    `, nodeId, ...countScope.params),
  ])

  return {
    data: rows,
    meta: { page, limit, total: Number(countRows[0]?.count ?? 0) },
  }
}

// ── Portscan queries ──────────────────────────────────────────────────────────

const portscansIngestSchema = z.object({
  id: z.string(),
  sensorId: z.string(),
  srcIp: z.string().min(1),
  dstPorts: z.array(z.number().int()).default([]),
  nodeId: z.string().optional(),
  scanType: z.string().default('syn'),
  timestamp: z.string(),
})

async function ingestPortscan(fastify: FastifyInstance, body: z.infer<typeof portscansIngestSchema>) {
  await fastify.prisma.$executeRawUnsafe(`
    INSERT INTO deception_portscans (id, sensor_id, timestamp, src_ip, dst_ports, node_id, scan_type)
    VALUES ($1, $2, $3::timestamptz, $4, $5::integer[], $6, $7)
    ON CONFLICT (id) DO NOTHING
  `, body.id, body.sensorId, body.timestamp, body.srcIp, body.dstPorts, body.nodeId ?? null, body.scanType)
}

async function queryPortscans(
  fastify: FastifyInstance,
  scope: Scope,
  page: number,
  limit: number,
  nodeId: string | null,
) {
  const offset = (page - 1) * limit

  // rows query: $1=limit, $2=offset, then optional scope at $3, then optional nodeId
  const rowsScope = sensorScopeClause(scope, 3, 'sensor_id')
  const rowsNodeIdx = 3 + rowsScope.params.length  // next free placeholder index
  const rowsNodeClause = nodeId ? ` AND node_id = $${rowsNodeIdx}` : ''
  const rowParams = [limit, offset, ...rowsScope.params, ...(nodeId ? [nodeId] : [])]

  // count query: $1 is the first free placeholder (no limit/offset needed)
  const countScope = sensorScopeClause(scope, 1, 'sensor_id')
  const countNodeIdx = 1 + countScope.params.length
  const countNodeClause = nodeId ? ` AND node_id = $${countNodeIdx}` : ''
  const countParams = [...countScope.params, ...(nodeId ? [nodeId] : [])]

  const [rows, countRows] = await Promise.all([
    fastify.prismaRead.$queryRawUnsafe<Array<{
      id: string; sensor_id: string; timestamp: Date; src_ip: string;
      dst_ports: number[]; node_id: string | null; scan_type: string;
    }>>(`
      SELECT id, sensor_id, timestamp, src_ip, dst_ports, node_id, scan_type
      FROM deception_portscans
      WHERE true${rowsScope.clause}${rowsNodeClause}
      ORDER BY timestamp DESC
      LIMIT $1 OFFSET $2
    `, ...rowParams),
    fastify.prismaRead.$queryRawUnsafe<[{ count: bigint }]>(`
      SELECT COUNT(*) FROM deception_portscans
      WHERE true${countScope.clause}${countNodeClause}
    `, ...countParams),
  ])

  return {
    data: rows,
    meta: { page, limit, total: Number(countRows[0]?.count ?? 0) },
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function deceptionRoutes(fastify: FastifyInstance) {
  // Resolve the :clientSlug param to a scope, or send 404. Used by all the
  // per-client routes below.
  async function resolveScope(clientSlug: string, reply: import('fastify').FastifyReply): Promise<Scope | undefined> {
    const cs = await resolveClientSensors(fastify.prismaRead, clientSlug)
    if (!cs) { reply.status(404).send({ error: 'client not found' }); return undefined }
    return cs
  }

  // ── Ingest (write path, no auth beyond shared secret checked by middleware) ──
  fastify.post('/ingest/deception/portscan', async (request, reply) => {
    const body = portscansIngestSchema.parse(request.body)
    await ingestPortscan(fastify, body)
    return reply.status(201).send({ ok: true })
  })

  // ── Global (all clients) ──────────────────────────────────────────────────
  fastify.get('/deception/overview', (_req, reply) =>
    withCache(fastify.cache, 'deception:overview', 30, () => queryOverview(fastify, null)).then(reply.send.bind(reply)))

  fastify.get('/deception/nodes', (_req, reply) =>
    withCache(fastify.cache, 'deception:nodes', 30, () => queryNodes(fastify, null)).then(reply.send.bind(reply)))

  fastify.get('/deception/killchain', (request, reply) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(200) }).parse(request.query)
    return withCache(fastify.cache, `deception:killchain:${q.limit}`, 30, () => queryKillchain(fastify, null, q.limit)).then(reply.send.bind(reply))
  })

  fastify.get('/deception/events', async (request, reply) => {
    const q = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      nodeId: z.string().optional(),
    }).parse(request.query)
    return reply.send(await queryEvents(fastify, null, q.page, q.limit, q.nodeId ?? null))
  })

  fastify.get('/deception/portscans', async (request, reply) => {
    const q = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      nodeId: z.string().optional(),
    }).parse(request.query)
    return reply.send(await queryPortscans(fastify, null, q.page, q.limit, q.nodeId ?? null))
  })

  // ── Per-client ────────────────────────────────────────────────────────────
  fastify.get('/clients/:clientSlug/deception/overview', async (request, reply) => {
    const { clientSlug } = request.params as { clientSlug: string }
    const scope = await resolveScope(clientSlug, reply)
    if (scope === undefined) return
    return withCache(fastify.cache, `deception:${clientSlug}:overview`, 30, () => queryOverview(fastify, scope)).then(reply.send.bind(reply))
  })

  fastify.get('/clients/:clientSlug/deception/nodes', async (request, reply) => {
    const { clientSlug } = request.params as { clientSlug: string }
    const scope = await resolveScope(clientSlug, reply)
    if (scope === undefined) return
    return withCache(fastify.cache, `deception:${clientSlug}:nodes`, 30, () => queryNodes(fastify, scope)).then(reply.send.bind(reply))
  })

  fastify.get('/clients/:clientSlug/deception/killchain', async (request, reply) => {
    const { clientSlug } = request.params as { clientSlug: string }
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(200) }).parse(request.query)
    const scope = await resolveScope(clientSlug, reply)
    if (scope === undefined) return
    return withCache(fastify.cache, `deception:${clientSlug}:killchain:${q.limit}`, 30, () => queryKillchain(fastify, scope, q.limit)).then(reply.send.bind(reply))
  })

  fastify.get('/clients/:clientSlug/deception/events', async (request, reply) => {
    const { clientSlug } = request.params as { clientSlug: string }
    const q = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      nodeId: z.string().optional(),
    }).parse(request.query)
    const scope = await resolveScope(clientSlug, reply)
    if (scope === undefined) return
    return reply.send(await queryEvents(fastify, scope, q.page, q.limit, q.nodeId ?? null))
  })

  fastify.get('/clients/:clientSlug/deception/portscans', async (request, reply) => {
    const { clientSlug } = request.params as { clientSlug: string }
    const q = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      nodeId: z.string().optional(),
    }).parse(request.query)
    const scope = await resolveScope(clientSlug, reply)
    if (scope === undefined) return
    return reply.send(await queryPortscans(fastify, scope, q.page, q.limit, q.nodeId ?? null))
  })
}
