import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { resolveClientSensors, buildPagination } from '../lib/client-helpers.js'
import { withCache } from '../lib/cache-helper.js'

const slugParam   = z.object({ clientSlug: z.string().trim().min(1) })
const pageQuery   = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) })
const IP_RE       = /^[\d.]{7,15}$|^[0-9a-fA-F:]+:[0-9a-fA-F:]+$/

// The client threats ranking aggregates by IP over the sensors' history. Bound it
// to a default lookback (retention already caps most tables near 90 days) so the
// timestamp indexes can prune instead of scanning the full history.
const THREATS_WINDOW_DAYS = 90
function threatsCutoff(): Date {
  return new Date(Date.now() - THREATS_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

type LogRow = {
  id: string; source: string; protocol: string; src_ip: string; event_type: string
  ts: Date; message: string | null; command: string | null; username: string | null
  password: string | null; session_id: string | null; extra: string | null
}
type ThreatRow = { src_ip: string; total_events: bigint; sources: string; last_seen: Date; login_successes: bigint; protocols: string }
type BucketRow  = { bucket: Date; ssh: bigint; protocol: bigint; web: bigint }
type MetricsRow = { total_events: number; unique_ips: number; login_successes: number }

function parseJson(s: string | null) {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

function mapLogRow(r: LogRow) {
  return {
    id: r.id, source: r.source, protocol: r.protocol, srcIp: r.src_ip,
    eventType: r.event_type, timestamp: r.ts, message: r.message,
    command: r.command, username: r.username, password: r.password,
    sessionId: r.session_id, extra: parseJson(r.extra),
  }
}

function buildEventFilters(ip?: string, q?: string) {
  const ipCond = ip ? Prisma.sql`AND src_ip = ${ip}` : Prisma.sql``
  const qPat   = q ? `%${q}%` : ''
  const qCond  = q
    ? Prisma.sql`AND (COALESCE(username,'') ILIKE ${qPat} OR COALESCE(command,'') ILIKE ${qPat} OR event_type ILIKE ${qPat})`
    : Prisma.sql``
  return { ipCond, qCond }
}

export async function clientObservabilityRoutes(fastify: FastifyInstance) {
  fastify.get('/clients/:clientSlug/events', async (request, reply) => {
    const params = slugParam.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client slug' })

    const query = pageQuery.extend({
      source:   z.enum(['ssh', 'protocol', 'web', 'all']).default('all'),
      sensorId: z.string().trim().min(1).optional(),
      ip:       z.string().trim().optional(),
      q:        z.string().trim().min(1).max(200).optional(),
    }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' })

    const { page, pageSize, source } = query.data
    const offset = (page - 1) * pageSize
    const cs = await resolveClientSensors(fastify.prismaRead, params.data.clientSlug)
    if (!cs) return reply.status(404).send({ error: 'Client not found' })
    // Optionally narrow to a single sensor, but only if it belongs to this client
    // (so the param can't be used to read another client's telemetry).
    const scopedSensorIds = query.data.sensorId
      ? cs.sensorIds.filter((id) => id === query.data.sensorId)
      : cs.sensorIds
    if (scopedSensorIds.length === 0) return reply.send({ items: [], pagination: buildPagination(page, pageSize, 0) })

    // Normalize search: IP-like strings use exact indexed match, everything else uses ILIKE
    const rawQ  = query.data.q
    const rawIp = query.data.ip ?? (rawQ && IP_RE.test(rawQ) ? rawQ : undefined)
    const textQ = rawQ && !IP_RE.test(rawQ) ? rawQ : undefined
    const { ipCond, qCond } = buildEventFilters(rawIp, textQ)

    const wantSsh      = source === 'all' || source === 'ssh'
    const wantProtocol = source === 'all' || source === 'protocol'
    const wantWeb      = source === 'all' || source === 'web'
    const sids         = Prisma.join(scopedSensorIds)

    // The COUNT over the 3-table UNION is the expensive part and does not change
    // between pages, so cache it per (client, sensor, source, filters) and only
    // run the page-row query on each pagination click.
    const countKey = `client:events:count:${cs.clientId}:${query.data.sensorId ?? 'all'}:${source}:${rawIp ?? ''}:${textQ ?? ''}`

    // Whether we can push the ORDER BY/LIMIT into each UNION branch. Only safe
    // without per-column filters (they're applied post-UNION on normalized
    // names). The unfiltered path is the common one (initial load) and the one
    // that was doing a Seq Scan of ~1M rows + global sort (~560ms); pushing a
    // (OFFSET+pageSize) LIMIT into each branch lets each table use its timestamp
    // index instead, measured ~560ms -> <1ms.
    const hasFilters = !!rawIp || !!textQ
    const perBranch = offset + pageSize

    const rowQuery = hasFilters
      ? fastify.prismaRead.$queryRaw<LogRow[]>`
          SELECT id, source, protocol, src_ip, event_type, ts, message, command, username, password, session_id, extra
          FROM (
            SELECT e.id::text, 'ssh'::text AS source, 'ssh'::text AS protocol, e.src_ip, e.event_type,
                   e.event_ts AS ts, e.message, e.command, e.username, e.password,
                   e.session_id::text AS session_id, e.normalized_json::text AS extra
            FROM events e JOIN sessions s ON s.id = e.session_id
            WHERE s.sensor_id IN (${sids}) AND ${wantSsh}
            UNION ALL
            SELECT ph.id::text, 'protocol'::text, ph.protocol, ph.src_ip, ph.event_type,
                   ph.timestamp, NULL::text, (ph.data->>'command'), ph.username, ph.password,
                   NULL::text, ph.data::text
            FROM protocol_hits ph WHERE ph.sensor_id IN (${sids}) AND ${wantProtocol}
            UNION ALL
            SELECT wh.id::text, 'web'::text, 'http'::text, wh.src_ip, wh.attack_type,
                   wh.timestamp, NULL::text, wh.path, NULL::text, NULL::text, NULL::text,
                   json_build_object('method',wh.method,'path',wh.path,'query',wh.query,'userAgent',wh.user_agent,'attackType',wh.attack_type)::text
            FROM web_hits wh WHERE wh.sensor_id IN (${sids}) AND ${wantWeb}
          ) AS combined
          WHERE 1=1 ${ipCond} ${qCond}
          ORDER BY ts DESC LIMIT ${pageSize} OFFSET ${offset}
        `
      : fastify.prismaRead.$queryRaw<LogRow[]>`
          SELECT id, source, protocol, src_ip, event_type, ts, message, command, username, password, session_id, extra
          FROM (
            (SELECT e.id::text, 'ssh'::text AS source, 'ssh'::text AS protocol, e.src_ip, e.event_type,
                   e.event_ts AS ts, e.message, e.command, e.username, e.password,
                   e.session_id::text AS session_id, e.normalized_json::text AS extra
             FROM events e JOIN sessions s ON s.id = e.session_id
             WHERE s.sensor_id IN (${sids}) AND ${wantSsh}
             ORDER BY e.event_ts DESC LIMIT ${perBranch})
            UNION ALL
            (SELECT ph.id::text, 'protocol'::text, ph.protocol, ph.src_ip, ph.event_type,
                   ph.timestamp, NULL::text, (ph.data->>'command'), ph.username, ph.password,
                   NULL::text, ph.data::text
             FROM protocol_hits ph WHERE ph.sensor_id IN (${sids}) AND ${wantProtocol}
             ORDER BY ph.timestamp DESC LIMIT ${perBranch})
            UNION ALL
            (SELECT wh.id::text, 'web'::text, 'http'::text, wh.src_ip, wh.attack_type,
                   wh.timestamp, NULL::text, wh.path, NULL::text, NULL::text, NULL::text,
                   json_build_object('method',wh.method,'path',wh.path,'query',wh.query,'userAgent',wh.user_agent,'attackType',wh.attack_type)::text
             FROM web_hits wh WHERE wh.sensor_id IN (${sids}) AND ${wantWeb}
             ORDER BY wh.timestamp DESC LIMIT ${perBranch})
          ) AS combined
          ORDER BY ts DESC LIMIT ${pageSize} OFFSET ${offset}
        `

    const [rows, total] = await Promise.all([
      rowQuery,
      withCache(fastify.cache, countKey, 60, async () => {
        const countRows = await fastify.prismaRead.$queryRaw<[{ total: bigint }]>`
          SELECT COUNT(*) AS total FROM (
            SELECT e.src_ip, e.event_type, e.username, e.command FROM events e
            JOIN sessions s ON s.id = e.session_id
            WHERE s.sensor_id IN (${sids}) AND ${wantSsh}
            UNION ALL
            SELECT ph.src_ip, ph.event_type, ph.username, (ph.data->>'command') FROM protocol_hits ph
            WHERE ph.sensor_id IN (${sids}) AND ${wantProtocol}
            UNION ALL
            SELECT wh.src_ip, wh.attack_type, NULL, wh.path FROM web_hits wh
            WHERE wh.sensor_id IN (${sids}) AND ${wantWeb}
          ) AS t WHERE 1=1 ${ipCond} ${qCond}
        `
        return Number(countRows[0]?.total ?? 0)
      }),
    ])

    return reply.send({ items: rows.map(mapLogRow), pagination: buildPagination(page, pageSize, total) })
  })

  fastify.get('/clients/:clientSlug/timeline', async (request, reply) => {
    const params = slugParam.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client slug' })

    const query = z.object({
      range: z.enum(['day', 'week', 'month']).default('week'),
      sensorId: z.string().trim().min(1).optional(),
    }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' })

    const cs = await resolveClientSensors(fastify.prismaRead, params.data.clientSlug)
    if (!cs) return reply.status(404).send({ error: 'Client not found' })
    const scopedSensorIds = query.data.sensorId
      ? cs.sensorIds.filter((id) => id === query.data.sensorId)
      : cs.sensorIds
    if (scopedSensorIds.length === 0) return reply.send([])

    const { range } = query.data
    const bucketUnit  = range === 'month' ? 'day' : 'hour'
    const intervalSql = range === 'day' ? '1 day' : range === 'week' ? '7 days' : '30 days'
    const sids        = Prisma.join(scopedSensorIds)

    const cacheKey = `client:timeline:${cs.clientId}:${query.data.sensorId ?? 'all'}:${range}`
    const result = await withCache(fastify.cache, cacheKey, 120, async () => {
      // Pre-aggregate per branch by bucket before the outer GROUP BY. The old shape
      // UNION ALL'd ~1M raw (ts, source) rows and globally sorted/aggregated them
      // (~2.5s). Each branch now collapses to one row per bucket against its own
      // timestamp index, so the outer aggregate only sees a few hundred rows
      // (measured ~2.5s -> ~0.6s, byte-identical results).
      const rows = await fastify.prismaRead.$queryRaw<BucketRow[]>`
        SELECT bucket, SUM(ssh) AS ssh, SUM(protocol) AS protocol, SUM(web) AS web
        FROM (
          SELECT date_trunc(${bucketUnit}, e.event_ts) AS bucket,
                 COUNT(*) AS ssh, 0::bigint AS protocol, 0::bigint AS web
          FROM events e JOIN sessions s ON s.id = e.session_id
          WHERE s.sensor_id IN (${sids}) AND e.event_ts >= NOW() - ${intervalSql}::interval
          GROUP BY 1
          UNION ALL
          SELECT date_trunc(${bucketUnit}, ph.timestamp), 0::bigint, COUNT(*), 0::bigint
          FROM protocol_hits ph
          WHERE ph.sensor_id IN (${sids}) AND ph.timestamp >= NOW() - ${intervalSql}::interval
          GROUP BY 1
          UNION ALL
          SELECT date_trunc(${bucketUnit}, wh.timestamp), 0::bigint, 0::bigint, COUNT(*)
          FROM web_hits wh
          WHERE wh.sensor_id IN (${sids}) AND wh.timestamp >= NOW() - ${intervalSql}::interval
          GROUP BY 1
        ) AS combined
        GROUP BY bucket ORDER BY bucket ASC
      `
      return rows.map(r => ({
        bucket: r.bucket,
        ssh: Number(r.ssh), protocol: Number(r.protocol), web: Number(r.web),
        total: Number(r.ssh) + Number(r.protocol) + Number(r.web),
      }))
    })

    return reply.send(result)
  })

  fastify.get('/clients/:clientSlug/threats', async (request, reply) => {
    const params = slugParam.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client slug' })

    const query = pageQuery.extend({ pageSize: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' })

    const { page, pageSize } = query.data
    const cs = await resolveClientSensors(fastify.prismaRead, params.data.clientSlug)
    if (!cs) return reply.status(404).send({ error: 'Client not found' })
    if (cs.sensorIds.length === 0) return reply.send({ items: [], pagination: buildPagination(page, pageSize, 0) })

    const offset = (page - 1) * pageSize
    const sids   = Prisma.join(cs.sensorIds)

    const since = threatsCutoff()
    const cacheKey = `client:threats:${cs.clientId}:${page}:${pageSize}`
    const result = await withCache(fastify.cache, cacheKey, 60, async () => {
      const [rows, countRows] = await Promise.all([
        fastify.prismaRead.$queryRaw<ThreatRow[]>`
          SELECT src_ip, COUNT(*) AS total_events, STRING_AGG(DISTINCT source, ',') AS sources,
                 MAX(ts) AS last_seen, COUNT(*) FILTER (WHERE login_success) AS login_successes,
                 STRING_AGG(DISTINCT protocol, ',') AS protocols
          FROM (
            SELECT s.src_ip, 'ssh' AS source, 'ssh' AS protocol,
                   COALESCE(s.ended_at, s.started_at) AS ts, COALESCE(s.login_success, false) AS login_success
            FROM sessions s WHERE s.sensor_id IN (${sids}) AND s.started_at >= ${since}
            UNION ALL
            SELECT ph.src_ip, 'protocol', ph.protocol, ph.timestamp, false
            FROM protocol_hits ph WHERE ph.sensor_id IN (${sids}) AND ph.timestamp >= ${since}
            UNION ALL
            SELECT wh.src_ip, 'web', 'http', wh.timestamp, false
            FROM web_hits wh WHERE wh.sensor_id IN (${sids}) AND wh.timestamp >= ${since}
          ) AS combined
          GROUP BY src_ip ORDER BY login_successes DESC, last_seen DESC, total_events DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `,
        fastify.prismaRead.$queryRaw<[{ total: bigint }]>`
          SELECT COUNT(DISTINCT src_ip) AS total FROM (
            SELECT src_ip FROM sessions WHERE sensor_id IN (${sids}) AND started_at >= ${since}
            UNION ALL SELECT src_ip FROM protocol_hits WHERE sensor_id IN (${sids}) AND timestamp >= ${since}
            UNION ALL SELECT src_ip FROM web_hits WHERE sensor_id IN (${sids}) AND timestamp >= ${since}
          ) AS ips
        `,
      ])

      return {
        items: rows.map(r => ({
          srcIp: r.src_ip, totalEvents: Number(r.total_events),
          sources: r.sources ? r.sources.split(',') : [],
          protocols: r.protocols ? r.protocols.split(',') : [],
          lastSeen: r.last_seen, loginSuccesses: Number(r.login_successes),
        })),
        pagination: buildPagination(page, pageSize, Number(countRows[0]?.total ?? 0)),
      }
    })

    return reply.send(result)
  })

  fastify.get('/clients/:clientSlug/today', async (request, reply) => {
    const params = slugParam.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client slug' })

    const cs = await resolveClientSensors(fastify.prismaRead, params.data.clientSlug)
    if (!cs) return reply.status(404).send({ error: 'Client not found' })
    if (cs.sensorIds.length === 0) return reply.send({ totalEvents: 0, uniqueIps: 0, loginSuccesses: 0, topProtocol: null })

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const sids = Prisma.join(cs.sensorIds)

    const cacheKey = `client:today:${cs.clientId}`
    const result = await withCache(fastify.cache, cacheKey, 60, async () => {
      const [metricsRows, protoRows] = await Promise.all([
        fastify.prismaRead.$queryRaw<MetricsRow[]>`
          SELECT COUNT(*)::int AS total_events, COUNT(DISTINCT src_ip)::int AS unique_ips,
                 COUNT(*) FILTER (WHERE login_success)::int AS login_successes
          FROM (
            SELECT s.src_ip, COALESCE(s.login_success, false) AS login_success
            FROM sessions s WHERE s.sensor_id IN (${sids}) AND s.started_at >= ${todayStart}
            UNION ALL
            SELECT ph.src_ip, false FROM protocol_hits ph
            WHERE ph.sensor_id IN (${sids}) AND ph.timestamp >= ${todayStart}
            UNION ALL
            SELECT wh.src_ip, false FROM web_hits wh
            WHERE wh.sensor_id IN (${sids}) AND wh.timestamp >= ${todayStart}
          ) AS t
        `,
        fastify.prismaRead.$queryRaw<[{ protocol: string }]>`
          SELECT protocol FROM (
            SELECT 'ssh' AS protocol FROM sessions WHERE sensor_id IN (${sids}) AND started_at >= ${todayStart}
            UNION ALL SELECT protocol FROM protocol_hits WHERE sensor_id IN (${sids}) AND timestamp >= ${todayStart}
            UNION ALL SELECT 'http' AS protocol FROM web_hits WHERE sensor_id IN (${sids}) AND timestamp >= ${todayStart}
          ) AS p GROUP BY protocol ORDER BY COUNT(*) DESC LIMIT 1
        `,
      ])

      const m = metricsRows[0] ?? { total_events: 0, unique_ips: 0, login_successes: 0 }
      return { totalEvents: m.total_events, uniqueIps: m.unique_ips, loginSuccesses: m.login_successes, topProtocol: protoRows[0]?.protocol ?? null }
    })

    return reply.send(result)
  })
}
