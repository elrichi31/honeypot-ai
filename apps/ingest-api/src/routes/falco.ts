import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'
import { eventBus } from '../lib/event-bus.js'
import { lookupGeo } from '../lib/geo.js'

// Priority order: higher index = lower severity
const PRIORITY_ORDER = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'informational', 'debug']

function priorityLevel(p: string): number {
  return PRIORITY_ORDER.indexOf(p.toLowerCase()) // -1 if unknown
}

function priorityToSeverityLabel(p: string): string {
  const idx = priorityLevel(p)
  if (idx <= 2) return 'critical'   // emergency, alert, critical
  if (idx <= 4) return 'high'       // error, warning
  if (idx === 5) return 'medium'    // notice
  return 'low'                       // informational, debug, unknown
}

const falcoEventSchema = z.object({
  hostname:  z.string().optional(),
  output:    z.string().default(''),
  priority:  z.string().default('warning'),
  rule:      z.string().default(''),
  source:    z.string().optional(),
  tags:      z.array(z.string()).optional().default([]),
  time:      z.string(),
  sensor_id: z.string().default(''),
  output_fields: z.record(z.unknown()).optional().default({}),
})

type FalcoEvent = z.infer<typeof falcoEventSchema>

function extractField<T>(fields: Record<string, unknown>, key: string): T | null {
  const v = fields[key]
  return v !== undefined && v !== null ? (v as T) : null
}

async function persistAlert(fastify: FastifyInstance, evt: FalcoEvent) {
  const ts = new Date(evt.time)
  if (isNaN(ts.getTime())) return

  const f = evt.output_fields as Record<string, unknown>
  const containerId   = extractField<string>(f, 'container.id')
  const containerName = extractField<string>(f, 'container.name')
  const procName      = extractField<string>(f, 'proc.name')
  const procCmdline   = extractField<string>(f, 'proc.cmdline')
  const userName      = extractField<string>(f, 'user.name')
  const evtType       = extractField<string>(f, 'evt.type')
  const fdName        = extractField<string>(f, 'fd.name')

  await fastify.prisma.$executeRaw`
    INSERT INTO falco_alerts (
      id, sensor_id, rule, priority, output,
      container_id, container_name, proc_name, proc_cmdline,
      user_name, evt_type, fd_name, tags, output_fields, timestamp
    ) VALUES (
      gen_random_uuid()::text,
      ${evt.sensor_id},
      ${evt.rule},
      ${evt.priority.toLowerCase()},
      ${evt.output},
      ${containerId},
      ${containerName},
      ${procName},
      ${procCmdline},
      ${userName},
      ${evtType},
      ${fdName},
      ${evt.tags}::text[],
      CAST(${JSON.stringify(evt.output_fields)} AS jsonb),
      ${ts}
    )
  `

  eventBus.emit('attack', {
    type: 'falco',
    priority: evt.priority,
    rule: evt.rule,
    container: containerName ?? 'unknown',
    timestamp: ts.toISOString(),
  })
}

export async function falcoRoutes(fastify: FastifyInstance) {
  // POST /ingest/falco/alert — receives Falco JSON events from Vector
  fastify.post('/ingest/falco/alert', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const body = request.body
    const events: unknown[] = Array.isArray(body) ? body : [body]

    let accepted = 0
    let rejected = 0

    for (const event of events) {
      const parsed = falcoEventSchema.safeParse(event)
      if (!parsed.success) {
        rejected++
        continue
      }
      try {
        await persistAlert(fastify, parsed.data)
        accepted++
      } catch (err) {
        fastify.log.error({ err }, 'falco alert persist failed')
        rejected++
      }
    }

    return reply.status(200).send({ accepted, rejected })
  })

  // GET /falco/alerts — paginated alerts with optional filters
  fastify.get('/falco/alerts', async (request, reply) => {
    const querySchema = z.object({
      page:      z.coerce.number().int().min(1).default(1),
      pageSize:  z.coerce.number().int().min(10).max(200).default(50),
      priority:  z.string().optional(),
      container: z.string().optional(),
      q:         z.string().optional(),
    })

    const params = querySchema.safeParse(request.query)
    if (!params.success) return reply.status(400).send({ error: 'Invalid query params' })

    const { page, pageSize, priority, container, q } = params.data
    const offset = (page - 1) * pageSize

    const safePriority  = priority  && /^[a-z]+$/.test(priority)  ? priority  : null
    const safeContainer = container && /^[a-zA-Z0-9_-]+$/.test(container) ? container : null
    const safeQ = q ? q.slice(0, 100).replace(/[%_\\]/g, '\\$&') : null

    const priorityFilter   = safePriority  ? `AND priority = '${safePriority}'`          : ''
    const containerFilter  = safeContainer ? `AND container_name = '${safeContainer}'`    : ''
    const qFilter          = safeQ
      ? `AND (rule ILIKE '%${safeQ}%' OR output ILIKE '%${safeQ}%' OR container_name ILIKE '%${safeQ}%')`
      : ''

    const [alerts, countRows] = await Promise.all([
      fastify.prisma.$queryRawUnsafe<Array<{
        id: string
        sensor_id: string
        rule: string
        priority: string
        output: string
        container_id: string | null
        container_name: string | null
        proc_name: string | null
        proc_cmdline: string | null
        user_name: string | null
        evt_type: string | null
        fd_name: string | null
        tags: string[]
        timestamp: Date
        created_at: Date
      }>>(`
        SELECT id, sensor_id, rule, priority, output,
               container_id, container_name, proc_name, proc_cmdline,
               user_name, evt_type, fd_name, tags, timestamp, created_at
        FROM falco_alerts
        WHERE 1=1 ${priorityFilter} ${containerFilter} ${qFilter}
        ORDER BY timestamp DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      fastify.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
        SELECT COUNT(*) AS count
        FROM falco_alerts
        WHERE 1=1 ${priorityFilter} ${containerFilter} ${qFilter}
      `),
    ])

    const total = Number(countRows[0]?.count ?? 0)

    return reply.send({
      items: alerts.map((a) => ({
        ...a,
        severityLabel: priorityToSeverityLabel(a.priority),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      },
    })
  })

  // GET /falco/stats — summary stats for the dashboard
  fastify.get('/falco/stats', async (_request, reply) => {
    const [totals, topRules, topContainers, recentHourly] = await Promise.all([
      fastify.prisma.$queryRaw<Array<{
        total: bigint
        critical: bigint
        high: bigint
        medium: bigint
        low: bigint
      }>>`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE priority IN ('emergency','alert','critical')) AS critical,
          COUNT(*) FILTER (WHERE priority IN ('error','warning'))              AS high,
          COUNT(*) FILTER (WHERE priority = 'notice')                          AS medium,
          COUNT(*) FILTER (WHERE priority IN ('informational','debug'))        AS low
        FROM falco_alerts
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `,
      fastify.prisma.$queryRaw<Array<{ rule: string; priority: string; count: bigint }>>`
        SELECT rule, priority, COUNT(*) AS count
        FROM falco_alerts
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY rule, priority
        ORDER BY count DESC
        LIMIT 10
      `,
      fastify.prisma.$queryRaw<Array<{ container_name: string | null; count: bigint }>>`
        SELECT container_name, COUNT(*) AS count
        FROM falco_alerts
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY container_name
        ORDER BY count DESC
        LIMIT 10
      `,
      fastify.prisma.$queryRaw<Array<{ hour: Date; count: bigint }>>`
        SELECT DATE_TRUNC('hour', created_at) AS hour, COUNT(*) AS count
        FROM falco_alerts
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY hour
        ORDER BY hour ASC
      `,
    ])

    const t = totals[0]
    return reply.send({
      last24h: {
        total:    Number(t?.total    ?? 0),
        critical: Number(t?.critical ?? 0),
        high:     Number(t?.high     ?? 0),
        medium:   Number(t?.medium   ?? 0),
        low:      Number(t?.low      ?? 0),
      },
      topRules: topRules.map((r) => ({
        rule:          r.rule,
        priority:      r.priority,
        severityLabel: priorityToSeverityLabel(r.priority),
        count:         Number(r.count),
      })),
      topContainers: topContainers.map((c) => ({
        containerName: c.container_name ?? '(host)',
        count:         Number(c.count),
      })),
      hourly: recentHourly.map((r) => ({
        hour:  r.hour,
        count: Number(r.count),
      })),
    })
  })
}
