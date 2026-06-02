import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'
import { lookupGeo } from '../lib/geo.js'
import { eventBus } from '../lib/event-bus.js'
import { withCache } from '../lib/cache-helper.js'

// IPs to exclude from stats/alerts (own server IPs)
const OWN_IPS = new Set(
  (process.env.SURICATA_OWN_IPS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
)

// Signatures that are Suricata-internal TCP/IP noise (not real attacks)
const NOISE_PATTERN = "signature NOT ILIKE 'SURICATA %'"

const eveAlertSchema = z.object({
  timestamp: z.string(),
  flow_id: z.number().optional(),
  in_iface: z.string().optional(),
  event_type: z.literal('alert'),
  src_ip: z.string().default(''),
  src_port: z.number().int().optional(),
  dest_ip: z.string().default(''),
  dest_port: z.number().int().optional(),
  proto: z.string().default(''),
  sensor_id: z.string().default(''),
  alert: z.object({
    action: z.string().default('allowed'),
    gid: z.number().optional(),
    signature_id: z.number().int().default(0),
    rev: z.number().optional(),
    signature: z.string().default(''),
    category: z.string().default(''),
    severity: z.number().int().min(1).max(4).default(3),
  }),
})

type EveAlert = z.infer<typeof eveAlertSchema>

function severityLabel(s: number) {
  if (s === 1) return 'critical'
  if (s === 2) return 'high'
  if (s === 3) return 'medium'
  return 'low'
}

async function persistAlert(fastify: FastifyInstance, alert: EveAlert) {
  const ts = new Date(alert.timestamp)
  if (isNaN(ts.getTime())) return

  await fastify.prisma.$executeRaw`
    INSERT INTO suricata_alerts (
      id, sensor_id, timestamp, src_ip, src_port, dest_ip, dest_port,
      proto, action, signature_id, signature, category, severity,
      flow_id, in_iface, raw
    ) VALUES (
      gen_random_uuid()::text,
      ${alert.sensor_id},
      ${ts},
      ${alert.src_ip},
      ${alert.src_port ?? null},
      ${alert.dest_ip},
      ${alert.dest_port ?? null},
      ${alert.proto},
      ${alert.alert.action},
      ${alert.alert.signature_id},
      ${alert.alert.signature},
      ${alert.alert.category},
      ${alert.alert.severity},
      ${alert.flow_id ?? null},
      ${alert.in_iface ?? null},
      CAST(${JSON.stringify(alert)} AS jsonb)
    )
    ON CONFLICT DO NOTHING
  `

  if (OWN_IPS.has(alert.src_ip)) return

  const geo = lookupGeo(alert.src_ip)
  if (geo) {
    eventBus.emit('attack', {
      type: 'ids',
      ip: alert.src_ip,
      ...geo,
      timestamp: ts.toISOString(),
    })
  }
}

export async function suricataRoutes(fastify: FastifyInstance) {
  fastify.post('/ingest/suricata/alert', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const body = request.body
    const events: unknown[] = Array.isArray(body) ? body : [body]

    let accepted = 0
    let rejected = 0

    for (const event of events) {
      const parsed = eveAlertSchema.safeParse(event)
      if (!parsed.success) { rejected++; continue }
      try {
        await persistAlert(fastify, parsed.data)
        accepted++
      } catch (err) {
        fastify.log.error({ err }, 'suricata alert persist failed')
        rejected++
      }
    }

    return reply.status(200).send({ accepted, rejected })
  })

  fastify.get('/suricata/alerts', async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(10).max(200).default(50),
      severity: z.coerce.number().int().min(1).max(4).optional(),
      srcIp: z.string().optional(),
      q: z.string().optional(),
      hideNoise: z.coerce.boolean().default(true),
      excludeOwnIps: z.coerce.boolean().default(true),
    })

    const params = querySchema.safeParse(request.query)
    if (!params.success) return reply.status(400).send({ error: 'Invalid query params' })

    const { page, pageSize, severity, srcIp, q, hideNoise, excludeOwnIps } = params.data
    const offset = (page - 1) * pageSize

    const safeIp = srcIp && /^[0-9a-fA-F.:]+$/.test(srcIp) ? srcIp : null
    const safeQ = q ? q.slice(0, 100).replace(/[%_\\]/g, '\\$&') : null

    const ownIpList = [...OWN_IPS].map(ip => `'${ip}'`).join(',')

    const filters = [
      severity != null ? `AND severity = ${severity}` : '',
      safeIp ? `AND src_ip = '${safeIp}'` : '',
      safeQ ? `AND (signature ILIKE '%${safeQ}%' OR category ILIKE '%${safeQ}%' OR src_ip ILIKE '%${safeQ}%')` : '',
      hideNoise ? `AND ${NOISE_PATTERN}` : '',
      excludeOwnIps && ownIpList ? `AND src_ip NOT IN (${ownIpList})` : '',
    ].join(' ')

    const [alerts, countRows] = await Promise.all([
      fastify.prismaRead.$queryRawUnsafe<Array<{
        id: string; sensor_id: string; timestamp: Date
        src_ip: string; src_port: number | null; dest_ip: string; dest_port: number | null
        proto: string; action: string; signature_id: number; signature: string
        category: string; severity: number; flow_id: bigint | null; in_iface: string | null
      }>>(`
        SELECT id, sensor_id, timestamp, src_ip, src_port, dest_ip, dest_port,
               proto, action, signature_id, signature, category, severity, flow_id, in_iface
        FROM suricata_alerts
        WHERE 1=1 ${filters}
        ORDER BY timestamp DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      fastify.prismaRead.$queryRawUnsafe<Array<{ count: bigint }>>(`
        SELECT COUNT(*) AS count FROM suricata_alerts WHERE 1=1 ${filters}
      `),
    ])

    const total = Number(countRows[0]?.count ?? 0)

    return reply.send({
      items: alerts.map((a) => ({
        ...a,
        flowId: a.flow_id !== null ? Number(a.flow_id) : null,
        flow_id: undefined,
        severityLabel: severityLabel(a.severity),
        country: lookupGeo(a.src_ip)?.country ?? null,
      })),
      pagination: {
        page, pageSize, total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      },
    })
  })

  fastify.get('/suricata/stats', async (request, reply) => {
    const rangeParam = (request.query as Record<string, string>).range ?? '24h'
    const validRanges = { '24h': { interval: '24 hours', trunc: 'hour' }, '7d': { interval: '7 days', trunc: 'day' }, '30d': { interval: '30 days', trunc: 'day' } } as const
    const { interval, trunc } = validRanges[rangeParam as keyof typeof validRanges] ?? validRanges['24h']

    const ownIpList = [...OWN_IPS].map(ip => `'${ip}'`).join(',')
    const ownIpFilter = ownIpList ? `AND src_ip NOT IN (${ownIpList})` : ''

    const payload = await withCache(fastify.cache, `suricata:stats:${rangeParam}`, 60, async () => {
    const [totals, threatTotals, topSigs, topThreatSigs, topSources, timeline] = await Promise.all([
      fastify.prismaRead.$queryRawUnsafe<Array<{ total: bigint; critical: bigint; high: bigint; medium: bigint; low: bigint }>>(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE severity = 1) AS critical,
          COUNT(*) FILTER (WHERE severity = 2) AS high,
          COUNT(*) FILTER (WHERE severity = 3) AS medium,
          COUNT(*) FILTER (WHERE severity = 4) AS low
        FROM suricata_alerts
        WHERE timestamp > NOW() - INTERVAL '${interval}'
      `),
      fastify.prismaRead.$queryRawUnsafe<Array<{ total: bigint; critical: bigint; high: bigint; medium: bigint; low: bigint }>>(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE severity = 1) AS critical,
          COUNT(*) FILTER (WHERE severity = 2) AS high,
          COUNT(*) FILTER (WHERE severity = 3) AS medium,
          COUNT(*) FILTER (WHERE severity = 4) AS low
        FROM suricata_alerts
        WHERE timestamp > NOW() - INTERVAL '${interval}'
          AND ${NOISE_PATTERN} ${ownIpFilter}
      `),
      fastify.prismaRead.$queryRawUnsafe<Array<{ signature: string; count: bigint; severity: number }>>(`
        SELECT signature, severity, COUNT(*) AS count
        FROM suricata_alerts
        WHERE timestamp > NOW() - INTERVAL '${interval}'
        GROUP BY signature, severity ORDER BY count DESC LIMIT 10
      `),
      fastify.prismaRead.$queryRawUnsafe<Array<{ signature: string; count: bigint; severity: number; category: string }>>(`
        SELECT signature, severity, category, COUNT(*) AS count
        FROM suricata_alerts
        WHERE timestamp > NOW() - INTERVAL '${interval}'
          AND ${NOISE_PATTERN} ${ownIpFilter}
        GROUP BY signature, severity, category ORDER BY count DESC LIMIT 10
      `),
      fastify.prismaRead.$queryRawUnsafe<Array<{ src_ip: string; count: bigint }>>(`
        SELECT src_ip, COUNT(*) AS count
        FROM suricata_alerts
        WHERE timestamp > NOW() - INTERVAL '${interval}'
          ${ownIpFilter} AND ${NOISE_PATTERN}
        GROUP BY src_ip ORDER BY count DESC LIMIT 10
      `),
      fastify.prismaRead.$queryRawUnsafe<Array<{ bucket: Date; total: bigint; threats: bigint }>>(`
        SELECT
          DATE_TRUNC('${trunc}', timestamp) AS bucket,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE ${NOISE_PATTERN}) AS threats
        FROM suricata_alerts
        WHERE timestamp > NOW() - INTERVAL '${interval}'
          ${ownIpFilter}
        GROUP BY bucket ORDER BY bucket ASC
      `),
    ])

    const t = totals[0]
    const th = threatTotals[0]

    return {
      last24h: {
        total: Number(t?.total ?? 0),
        critical: Number(t?.critical ?? 0),
        high: Number(t?.high ?? 0),
        medium: Number(t?.medium ?? 0),
        low: Number(t?.low ?? 0),
      },
      threats24h: {
        total: Number(th?.total ?? 0),
        critical: Number(th?.critical ?? 0),
        high: Number(th?.high ?? 0),
        medium: Number(th?.medium ?? 0),
        low: Number(th?.low ?? 0),
      },
      topSignatures: topSigs.map(s => ({
        signature: s.signature, severity: s.severity,
        severityLabel: severityLabel(s.severity), count: Number(s.count),
      })),
      topThreatSignatures: topThreatSigs.map(s => ({
        signature: s.signature, severity: s.severity, category: s.category,
        severityLabel: severityLabel(s.severity), count: Number(s.count),
      })),
      topSources: topSources.map(s => {
        const geo = lookupGeo(s.src_ip)
        return { srcIp: s.src_ip, count: Number(s.count), country: geo?.country ?? null }
      }),
      timeline: timeline.map(r => ({
        bucket: r.bucket,
        total: Number(r.total),
        threats: Number(r.threats),
      })),
    }
    })

    return reply.send(payload)
  })
}
