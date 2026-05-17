import net from 'net'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'
import { clearSensorOfflineAlert } from '../lib/threat-alerts.js'

const heartbeatSchema = z.object({
  sensorId: z.string().min(1),
  name: z.string().min(1),
  protocol: z.string().min(1),
  clientSlug: z.string().default(''),
  clientName: z.string().default(''),
  ip: z.string().default(''),
  version: z.string().default(''),
  ports: z.array(z.number().int().min(1).max(65535)).default([]),
  probePorts: z.array(z.number().int().min(1).max(65535)).default([]),
  host: z.string().default(''),
})

const assignSensorClientSchema = z.object({
  clientId: z.string().trim().nullable().optional(),
  clientSlug: z.string().trim().nullable().optional(),
})

function tcpProbe(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!host) return resolve(false)

    const sock = new net.Socket()
    let settled = false

    const finish = (up: boolean) => {
      if (!settled) {
        settled = true
        sock.destroy()
        resolve(up)
      }
    }

    sock.setTimeout(timeoutMs)
    sock.connect(port, host, () => finish(true))
    sock.on('error', () => finish(false))
    sock.on('timeout', () => finish(false))
  })
}

function normalizeIp(raw: string): string {
  return raw.replace(/^::ffff:/, '')
}

function normalizeSlug(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function clientNameFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function resolveClientId(
  fastify: FastifyInstance,
  slugOrId: { slug?: string | null; name?: string | null; id?: string | null },
): Promise<{ id: string | null; name: string | null; slug: string | null }> {
  if (slugOrId.id) {
    const rows = await fastify.prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
      SELECT id, name, slug
      FROM clients
      WHERE id = ${slugOrId.id}
      LIMIT 1
    `
    const client = rows[0]
    return client
      ? { id: client.id, name: client.name, slug: client.slug }
      : { id: null, name: null, slug: null }
  }

  const normalizedSlug = normalizeSlug(slugOrId.slug ?? '')
  if (!normalizedSlug) return { id: null, name: null, slug: null }

  const now = new Date()
  const displayName = (slugOrId.name ?? '').trim() || clientNameFromSlug(normalizedSlug)
  const rows = await fastify.prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
    INSERT INTO clients (id, name, slug, description, created_at)
    VALUES (gen_random_uuid()::text, ${displayName}, ${normalizedSlug}, '', ${now})
    ON CONFLICT (slug) DO UPDATE SET
      name = COALESCE(NULLIF(EXCLUDED.name, ''), clients.name)
    RETURNING id, name, slug
  `

  const client = rows[0]
  return client
    ? { id: client.id, name: client.name, slug: client.slug }
    : { id: null, name: null, slug: null }
}

export async function sensorRoutes(fastify: FastifyInstance) {
  fastify.post('/sensors/heartbeat', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = heartbeatSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid heartbeat', details: parsed.error.flatten() })
    }

    const d = parsed.data
    const now = new Date()
    const probeHost = d.host || normalizeIp(request.ip ?? '')
    const probePorts = d.probePorts.length > 0 ? d.probePorts : d.ports
    const client = await resolveClientId(fastify, { slug: d.clientSlug, name: d.clientName })

    await fastify.prisma.$executeRaw`
      INSERT INTO sensors (
        id, sensor_id, client_id, name, protocol, ip, version,
        ports, probe_ports, probe_host, last_seen, created_at
      )
      VALUES (
        gen_random_uuid()::text, ${d.sensorId}, ${client.id}, ${d.name}, ${d.protocol},
        ${d.ip}, ${d.version},
        CAST(${JSON.stringify(d.ports)} AS jsonb),
        CAST(${JSON.stringify(probePorts)} AS jsonb),
        ${probeHost},
        ${now}, ${now}
      )
      ON CONFLICT (sensor_id) DO UPDATE SET
        client_id   = COALESCE(EXCLUDED.client_id, sensors.client_id),
        name        = EXCLUDED.name,
        protocol    = EXCLUDED.protocol,
        ip          = EXCLUDED.ip,
        version     = EXCLUDED.version,
        ports       = EXCLUDED.ports,
        probe_ports = EXCLUDED.probe_ports,
        probe_host  = EXCLUDED.probe_host,
        last_seen   = EXCLUDED.last_seen
    `

    clearSensorOfflineAlert(d.sensorId)
    return reply.status(200).send({ ok: true })
  })

  fastify.get('/sensors', async (_request, reply) => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)

    const sensors = await fastify.prisma.$queryRaw<Array<{
      sensor_id: string
      client_id: string | null
      client_name: string | null
      client_slug: string | null
      client_code: string | null
      name: string
      protocol: string
      ip: string
      version: string
      ports: number[]
      probe_ports: number[]
      probe_host: string
      last_seen: Date
      created_at: Date
      event_count: bigint
    }>>`
      SELECT
        s.sensor_id,
        c.id AS client_id,
        c.name AS client_name,
        c.slug AS client_slug,
        c.code AS client_code,
        s.name,
        s.protocol,
        s.ip,
        s.version,
        s.ports,
        s.probe_ports,
        s.probe_host,
        s.last_seen,
        s.created_at,
        CASE
          WHEN s.protocol = 'ssh' THEN (
            SELECT COUNT(*)::bigint FROM sessions sess
            WHERE sess.sensor_id = s.sensor_id
          )
          WHEN s.protocol = 'http' THEN (
            SELECT COUNT(*)::bigint FROM web_hits wh
            WHERE wh.sensor_id = s.sensor_id
          )
          ELSE (
            SELECT COUNT(*)::bigint FROM protocol_hits ph_s
            WHERE ph_s.sensor_id = s.sensor_id
               OR ph_s.data->>'sensor' = s.sensor_id
          )
        END AS event_count
      FROM sensors s
      LEFT JOIN clients c ON c.id = s.client_id
      ORDER BY s.last_seen DESC
    `

    const probeResults = await Promise.all(
      sensors.map(async (sensor) => {
        const displayPorts = Array.isArray(sensor.ports) ? sensor.ports : []
        const probePortsForSensor =
          Array.isArray(sensor.probe_ports) && sensor.probe_ports.length > 0
            ? sensor.probe_ports
            : displayPorts

        if (!sensor.probe_host || displayPorts.length === 0) return {}

        const pairs = await Promise.all(
          displayPorts.map(async (displayPort, index) => {
            const probePort = probePortsForSensor[index] ?? displayPort
            return [displayPort, await tcpProbe(sensor.probe_host, probePort)] as const
          }),
        )

        return Object.fromEntries(pairs)
      }),
    )

    const result = sensors.map((sensor, index) => ({
      sensorId: sensor.sensor_id,
      clientId: sensor.client_id,
      clientName: sensor.client_name,
      clientSlug: sensor.client_slug,
      clientCode: sensor.client_code ?? '',
      name: sensor.name,
      protocol: sensor.protocol,
      ip: sensor.ip,
      version: sensor.version,
      ports: Array.isArray(sensor.ports) ? sensor.ports : [],
      probeHost: sensor.probe_host,
      lastSeen: sensor.last_seen,
      createdAt: sensor.created_at,
      eventsTotal: Number(sensor.event_count),
      online: sensor.last_seen > twoMinutesAgo,
      portStatus: probeResults[index] as Record<number, boolean>,
    }))

    const hasRegisteredSsh = result.some((sensor) => sensor.protocol === 'ssh')
    if (!hasRegisteredSsh) {
      const sshStats = await fastify.prisma.$queryRaw<Array<{
        count: bigint
        last_seen: Date | null
      }>>`
        SELECT COUNT(*) AS count, MAX(started_at) AS last_seen
        FROM sessions
      `

      const ssh = sshStats[0]
      if (ssh && ssh.count > 0n) {
        result.push({
          sensorId: 'cowrie-ssh',
          clientId: null,
          clientName: null,
          clientSlug: null,
          name: 'SSH Honeypot (Cowrie)',
          protocol: 'ssh',
          ip: '-',
          version: '',
          ports: [],
          probeHost: '',
          lastSeen: ssh.last_seen ?? new Date(0),
          createdAt: new Date(0),
          eventsTotal: Number(ssh.count),
          online: ssh.last_seen ? ssh.last_seen > twoMinutesAgo : false,
          portStatus: {},
        })
      }
    }

    return reply.send(result)
  })

  fastify.put('/sensors/:sensorId/client', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
    const body = assignSensorClientSchema.safeParse(request.body)

    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'Invalid assignment payload' })
    }

    let client: { id: string | null; name: string | null; slug: string | null } = {
      id: null,
      name: null,
      slug: null,
    }

    if (body.data.clientId) {
      client = await resolveClientId(fastify, { id: body.data.clientId })
      if (!client.id) return reply.status(404).send({ error: 'Client not found' })
    } else if (body.data.clientSlug) {
      const slug = normalizeSlug(body.data.clientSlug)
      if (!slug) return reply.status(400).send({ error: 'Invalid client slug' })

      const rows = await fastify.prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
        SELECT id, name, slug
        FROM clients
        WHERE slug = ${slug}
        LIMIT 1
      `

      const existing = rows[0]
      client = existing
        ? { id: existing.id, name: existing.name, slug: existing.slug }
        : { id: null, name: null, slug: null }

      if (!client.id) return reply.status(404).send({ error: 'Client not found' })
    }

    const updated = await fastify.prisma.$queryRaw<Array<{ sensor_id: string }>>`
      UPDATE sensors
      SET client_id = ${client.id}
      WHERE sensor_id = ${params.data.sensorId}
      RETURNING sensor_id
    `

    if (updated.length === 0) return reply.status(404).send({ error: 'Sensor not found' })

    return reply.send({
      sensorId: updated[0].sensor_id,
      clientId: client.id,
      clientName: client.name,
      clientSlug: client.slug,
    })
  })

  fastify.delete('/sensors/:sensorId', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid sensorId' })

    const { sensorId } = params.data

    const deleted = await fastify.prisma.$queryRaw<Array<{ sensor_id: string }>>`
      DELETE FROM sensors WHERE sensor_id = ${sensorId} RETURNING sensor_id
    `

    if (deleted.length === 0) return reply.status(404).send({ error: 'Sensor not found' })

    return reply.send({ deleted: true, sensorId })
  })
}
