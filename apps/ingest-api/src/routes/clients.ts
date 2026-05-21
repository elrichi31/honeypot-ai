import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'

const clientSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().default(''),
  code: z.string().trim().default(''),
  description: z.string().trim().default(''),
  forwardUrl: z.string().trim().default(''),
})

function slugifyClient(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeClientCode(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '')
    .trim()
    .toUpperCase()
}

function deriveClientCode(value: string): string {
  return normalizeClientCode(value).slice(0, 12)
}

export async function clientRoutes(fastify: FastifyInstance) {
  fastify.get('/clients', async (_request, reply) => {
    const clients = await fastify.prisma.$queryRaw<Array<{
      id: string
      name: string
      slug: string
      code: string
      description: string
      forward_url: string
      created_at: Date
    }>>`
      SELECT id, name, slug, code, description, forward_url, created_at
      FROM clients
      ORDER BY name ASC, created_at ASC
    `

    return reply.send(
      clients.map((client) => ({
        id: client.id,
        name: client.name,
        slug: client.slug,
        code: client.code || deriveClientCode(client.slug || client.name),
        description: client.description,
        forwardUrl: client.forward_url,
        createdAt: client.created_at,
      })),
    )
  })

  fastify.post('/clients', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = clientSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid client payload', details: parsed.error.flatten() })
    }

    const name = parsed.data.name
    const slug = slugifyClient(parsed.data.slug || name)
    if (!slug) return reply.status(400).send({ error: 'Invalid client slug' })
    const code = normalizeClientCode(parsed.data.code || deriveClientCode(slug || name))
    if (!code) return reply.status(400).send({ error: 'Invalid client code' })

    const description = parsed.data.description
    const forwardUrl = parsed.data.forwardUrl
    if (forwardUrl && !/^https?:\/\//i.test(forwardUrl)) {
      return reply.status(400).send({ error: 'Forward URL must start with http:// or https://' })
    }
    const now = new Date()

    const rows = await fastify.prisma.$queryRaw<Array<{
      id: string
      name: string
      slug: string
      code: string
      description: string
      forward_url: string
      created_at: Date
    }>>`
      INSERT INTO clients (id, name, slug, code, description, forward_url, created_at)
      VALUES (gen_random_uuid()::text, ${name}, ${slug}, ${code}, ${description}, ${forwardUrl}, ${now})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        code = EXCLUDED.code,
        description = EXCLUDED.description,
        forward_url = EXCLUDED.forward_url
      RETURNING id, name, slug, code, description, forward_url, created_at
    `

    const client = rows[0]

    return reply.send({
      id: client.id,
      name: client.name,
      slug: client.slug,
      code: client.code || code,
      description: client.description,
      forwardUrl: client.forward_url,
      createdAt: client.created_at,
    })
  })

  fastify.patch('/clients/:clientId', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const params = z.object({ clientId: z.string().trim().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client id' })

    const parsed = z
      .object({
        name: z.string().trim().min(1).optional(),
        code: z.string().trim().optional(),
        description: z.string().trim().optional(),
        forwardUrl: z.string().trim().optional(),
      })
      .safeParse(request.body)

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid client payload', details: parsed.error.flatten() })
    }

    const currentRows = await fastify.prisma.$queryRaw<Array<{
      id: string
      name: string
      slug: string
      code: string
      description: string
      forward_url: string
      created_at: Date
    }>>`
      SELECT id, name, slug, code, description, forward_url, created_at
      FROM clients
      WHERE id = ${params.data.clientId}
      LIMIT 1
    `

    const current = currentRows[0]
    if (!current) return reply.status(404).send({ error: 'Client not found' })

    const nextName = parsed.data.name ?? current.name
    const nextCode =
      parsed.data.code !== undefined
        ? normalizeClientCode(parsed.data.code || deriveClientCode(current.slug || nextName))
        : current.code || deriveClientCode(current.slug || nextName)
    const nextDescription = parsed.data.description ?? current.description
    const nextForwardUrl = parsed.data.forwardUrl ?? current.forward_url
    if (!nextCode) return reply.status(400).send({ error: 'Invalid client code' })

    if (nextForwardUrl && !/^https?:\/\//i.test(nextForwardUrl)) {
      return reply.status(400).send({ error: 'Forward URL must start with http:// or https://' })
    }

    const rows = await fastify.prisma.$queryRaw<Array<{
      id: string
      name: string
      slug: string
      code: string
      description: string
      forward_url: string
      created_at: Date
    }>>`
      UPDATE clients
      SET
        name = ${nextName},
        code = ${nextCode},
        description = ${nextDescription},
        forward_url = ${nextForwardUrl}
      WHERE id = ${params.data.clientId}
      RETURNING id, name, slug, code, description, forward_url, created_at
    `

    const client = rows[0]
    return reply.send({
      id: client.id,
      name: client.name,
      slug: client.slug,
      code: client.code || nextCode,
      description: client.description,
      forwardUrl: client.forward_url,
      createdAt: client.created_at,
    })
  })

  fastify.delete('/clients/:clientId', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const params = z.object({ clientId: z.string().trim().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client id' })

    const existing = await fastify.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM clients WHERE id = ${params.data.clientId} LIMIT 1
    `
    if (!existing[0]) return reply.status(404).send({ error: 'Client not found' })

    await fastify.prisma.$executeRaw`
      UPDATE sensors SET client_id = NULL WHERE client_id = ${params.data.clientId}
    `

    await fastify.prisma.$executeRaw`
      DELETE FROM clients WHERE id = ${params.data.clientId}
    `

    return reply.status(204).send()
  })

  // ─── Client observability endpoints ─────────────────────────────────────────

  fastify.get('/clients/:clientSlug/events', async (request, reply) => {
    const params = z.object({ clientSlug: z.string().trim().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client slug' })

    const query = z.object({
      page:     z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
      source:   z.enum(['ssh', 'protocol', 'web', 'all']).default('all'),
    }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' })

    const { clientSlug } = params.data
    const { page, pageSize, source } = query.data
    const offset = (page - 1) * pageSize

    const clientRows = await fastify.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM clients WHERE slug = ${clientSlug} LIMIT 1
    `
    if (!clientRows[0]) return reply.status(404).send({ error: 'Client not found' })
    const clientId = clientRows[0].id

    type LogRow = {
      id: string; source: string; protocol: string; src_ip: string
      event_type: string; ts: Date; message: string | null
      command: string | null; username: string | null; password: string | null
    }

    // Each source filter: pass as text so SQL can compare
    const wantSsh      = source === 'all' || source === 'ssh'
    const wantProtocol = source === 'all' || source === 'protocol'
    const wantWeb      = source === 'all' || source === 'web'

    const [rows, countRows] = await Promise.all([
      fastify.prisma.$queryRaw<LogRow[]>`
        SELECT id, source, protocol, src_ip, event_type, ts, message, command, username, password
        FROM (
          SELECT
            e.id::text,
            'ssh'::text            AS source,
            'ssh'::text            AS protocol,
            e.src_ip,
            e.event_type,
            e.event_ts             AS ts,
            e.message,
            e.command,
            e.username,
            e.password
          FROM events e
          JOIN sessions s  ON s.id         = e.session_id
          JOIN sensors  sn ON sn.sensor_id = s.sensor_id
          WHERE sn.client_id = ${clientId}
            AND ${wantSsh}

          UNION ALL

          SELECT
            ph.id::text,
            'protocol'::text      AS source,
            ph.protocol,
            ph.src_ip,
            ph.event_type,
            ph.timestamp          AS ts,
            NULL::text            AS message,
            (ph.data->>'command') AS command,
            ph.username,
            ph.password
          FROM protocol_hits ph
          JOIN sensors sn ON sn.sensor_id = ph.sensor_id
          WHERE sn.client_id = ${clientId}
            AND ${wantProtocol}

          UNION ALL

          SELECT
            wh.id::text,
            'web'::text           AS source,
            'http'::text          AS protocol,
            wh.src_ip,
            wh.attack_type        AS event_type,
            wh.timestamp          AS ts,
            NULL::text            AS message,
            wh.path               AS command,
            NULL::text            AS username,
            NULL::text            AS password
          FROM web_hits wh
          JOIN sensors sn ON sn.sensor_id = wh.sensor_id
          WHERE sn.client_id = ${clientId}
            AND ${wantWeb}
        ) AS combined
        ORDER BY ts DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      fastify.prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COUNT(*) AS total FROM (
          SELECT 1
          FROM events e
          JOIN sessions s  ON s.id         = e.session_id
          JOIN sensors  sn ON sn.sensor_id = s.sensor_id
          WHERE sn.client_id = ${clientId} AND ${wantSsh}
          UNION ALL
          SELECT 1
          FROM protocol_hits ph
          JOIN sensors sn ON sn.sensor_id = ph.sensor_id
          WHERE sn.client_id = ${clientId} AND ${wantProtocol}
          UNION ALL
          SELECT 1
          FROM web_hits wh
          JOIN sensors sn ON sn.sensor_id = wh.sensor_id
          WHERE sn.client_id = ${clientId} AND ${wantWeb}
        ) AS t
      `,
    ])

    const total = Number(countRows[0]?.total ?? 0)
    const totalPages = Math.ceil(total / pageSize)

    return reply.send({
      items: rows.map(r => ({
        id: r.id,
        source: r.source,
        protocol: r.protocol,
        srcIp: r.src_ip,
        eventType: r.event_type,
        timestamp: r.ts,
        message: r.message,
        command: r.command,
        username: r.username,
        password: r.password,
      })),
      pagination: {
        page, pageSize, total, totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    })
  })

  fastify.get('/clients/:clientSlug/timeline', async (request, reply) => {
    const params = z.object({ clientSlug: z.string().trim().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client slug' })

    const query = z.object({
      range: z.enum(['day', 'week', 'month']).default('week'),
    }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' })

    const { clientSlug } = params.data
    const { range } = query.data

    const clientRows = await fastify.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM clients WHERE slug = ${clientSlug} LIMIT 1
    `
    if (!clientRows[0]) return reply.status(404).send({ error: 'Client not found' })
    const clientId = clientRows[0].id

    const bucketUnit  = range === 'month' ? 'day' : 'hour'
    const intervalSql = range === 'day' ? '1 day' : range === 'week' ? '7 days' : '30 days'

    type BucketRow = { bucket: Date; ssh: bigint; protocol: bigint; web: bigint }

    const rows = await fastify.prisma.$queryRaw<BucketRow[]>`
      SELECT
        date_trunc(${bucketUnit}, ts) AS bucket,
        COUNT(*) FILTER (WHERE source = 'ssh')      AS ssh,
        COUNT(*) FILTER (WHERE source = 'protocol') AS protocol,
        COUNT(*) FILTER (WHERE source = 'web')      AS web
      FROM (
        SELECT e.event_ts AS ts, 'ssh' AS source
        FROM events e
        JOIN sessions s  ON s.id          = e.session_id
        JOIN sensors  sn ON sn.sensor_id  = s.sensor_id
        WHERE sn.client_id = ${clientId}
          AND e.event_ts >= NOW() - ${intervalSql}::interval
        UNION ALL
        SELECT ph.timestamp AS ts, 'protocol' AS source
        FROM protocol_hits ph
        JOIN sensors sn ON sn.sensor_id = ph.sensor_id
        WHERE sn.client_id = ${clientId}
          AND ph.timestamp >= NOW() - ${intervalSql}::interval
        UNION ALL
        SELECT wh.timestamp AS ts, 'web' AS source
        FROM web_hits wh
        JOIN sensors sn ON sn.sensor_id = wh.sensor_id
        WHERE sn.client_id = ${clientId}
          AND wh.timestamp >= NOW() - ${intervalSql}::interval
      ) AS combined
      GROUP BY bucket
      ORDER BY bucket ASC
    `

    return reply.send(
      rows.map(r => ({
        bucket: r.bucket,
        ssh:      Number(r.ssh),
        protocol: Number(r.protocol),
        web:      Number(r.web),
        total:    Number(r.ssh) + Number(r.protocol) + Number(r.web),
      }))
    )
  })

  fastify.get('/clients/:clientSlug/threats', async (request, reply) => {
    const params = z.object({ clientSlug: z.string().trim().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid client slug' })

    const clientRows = await fastify.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM clients WHERE slug = ${clientSlug} LIMIT 1
    `
    if (!clientRows[0]) return reply.status(404).send({ error: 'Client not found' })
    const clientId = clientRows[0].id

    type ThreatRow = {
      src_ip: string
      total_events: bigint
      sources: string
      last_seen: Date
      login_successes: bigint
      protocols: string
    }

    const rows = await fastify.prisma.$queryRaw<ThreatRow[]>`
      SELECT
        src_ip,
        COUNT(*)                                                        AS total_events,
        STRING_AGG(DISTINCT source, ',')                                AS sources,
        MAX(ts)                                                         AS last_seen,
        COUNT(*) FILTER (WHERE login_success)                          AS login_successes,
        STRING_AGG(DISTINCT protocol, ',')                              AS protocols
      FROM (
        SELECT s.src_ip, 'ssh' AS source, 'ssh' AS protocol,
               COALESCE(s.ended_at, s.started_at) AS ts,
               COALESCE(s.login_success, false) AS login_success
        FROM sessions s
        JOIN sensors sn ON sn.sensor_id = s.sensor_id
        WHERE sn.client_id = ${clientId}
        UNION ALL
        SELECT ph.src_ip, 'protocol' AS source, ph.protocol,
               ph.timestamp AS ts, false AS login_success
        FROM protocol_hits ph
        JOIN sensors sn ON sn.sensor_id = ph.sensor_id
        WHERE sn.client_id = ${clientId}
        UNION ALL
        SELECT wh.src_ip, 'web' AS source, 'http' AS protocol,
               wh.timestamp AS ts, false AS login_success
        FROM web_hits wh
        JOIN sensors sn ON sn.sensor_id = wh.sensor_id
        WHERE sn.client_id = ${clientId}
      ) AS combined
      GROUP BY src_ip
      ORDER BY login_successes DESC, total_events DESC
      LIMIT 50
    `

    return reply.send(
      rows.map(r => ({
        srcIp:         r.src_ip,
        totalEvents:   Number(r.total_events),
        sources:       r.sources ? r.sources.split(',') : [],
        protocols:     r.protocols ? r.protocols.split(',') : [],
        lastSeen:      r.last_seen,
        loginSuccesses: Number(r.login_successes),
      }))
    )
  })
}
