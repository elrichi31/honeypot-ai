import type { FastifyInstance } from 'fastify'
import { tcpProbe, normalizeSlug, clientNameFromSlug } from './sensor-utils.js'

export type ClientRef = { id: string | null; name: string | null; slug: string | null }

export type SensorRow = {
  sensor_id: string; client_id: string | null; client_name: string | null
  client_slug: string | null; client_code: string | null; name: string
  protocol: string; ip: string; version: string; ports: number[]
  probe_ports: number[]; probe_host: string; last_seen: Date
  created_at: Date; event_count: bigint
}

export type SensorResult = {
  sensorId: string; clientId: string | null; clientName: string | null
  clientSlug: string | null; clientCode: string; name: string
  protocol: string; ip: string; version: string; ports: number[]
  probeHost: string; lastSeen: Date; createdAt: Date
  eventsTotal: number; online: boolean; portStatus: Record<number, boolean>
}

export async function resolveClientId(
  fastify: FastifyInstance,
  slugOrId: { slug?: string | null; name?: string | null; id?: string | null },
): Promise<ClientRef> {
  if (slugOrId.id) {
    const rows = await fastify.prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
      SELECT id, name, slug FROM clients WHERE id = ${slugOrId.id} LIMIT 1
    `
    const c = rows[0]
    return c ? { id: c.id, name: c.name, slug: c.slug } : { id: null, name: null, slug: null }
  }

  const normalizedSlug = normalizeSlug(slugOrId.slug ?? '')
  if (!normalizedSlug) return { id: null, name: null, slug: null }

  const displayName = (slugOrId.name ?? '').trim() || clientNameFromSlug(normalizedSlug)
  const rows = await fastify.prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
    INSERT INTO clients (id, name, slug, description, created_at)
    VALUES (gen_random_uuid()::text, ${displayName}, ${normalizedSlug}, '', ${new Date()})
    ON CONFLICT (slug) DO UPDATE SET
      name = COALESCE(NULLIF(EXCLUDED.name, ''), clients.name)
    RETURNING id, name, slug
  `
  const c = rows[0]
  return c ? { id: c.id, name: c.name, slug: c.slug } : { id: null, name: null, slug: null }
}

export async function querySensors(fastify: FastifyInstance): Promise<SensorRow[]> {
  return fastify.prisma.$queryRaw<SensorRow[]>`
    SELECT
      s.sensor_id, c.id AS client_id, c.name AS client_name, c.slug AS client_slug,
      c.code AS client_code, s.name, s.protocol, s.ip, s.version,
      s.ports, s.probe_ports, s.probe_host, s.last_seen, s.created_at,
      CASE
        WHEN s.protocol = 'ssh'  THEN (SELECT COUNT(*)::bigint FROM sessions   sess WHERE sess.sensor_id = s.sensor_id)
        WHEN s.protocol = 'http' THEN (SELECT COUNT(*)::bigint FROM web_hits      wh WHERE wh.sensor_id   = s.sensor_id)
        ELSE                          (SELECT COUNT(*)::bigint FROM protocol_hits ph WHERE ph.sensor_id   = s.sensor_id OR ph.data->>'sensor' = s.sensor_id)
      END AS event_count
    FROM sensors s
    LEFT JOIN clients c ON c.id = s.client_id
    ORDER BY s.last_seen DESC
  `
}

export async function probeSensorPorts(sensor: SensorRow): Promise<Record<number, boolean>> {
  const displayPorts  = Array.isArray(sensor.ports)       ? sensor.ports       : []
  const probePorts    = Array.isArray(sensor.probe_ports) && sensor.probe_ports.length > 0
    ? sensor.probe_ports
    : displayPorts

  if (!sensor.probe_host || displayPorts.length === 0) return {}

  const pairs = await Promise.all(
    displayPorts.map(async (displayPort, i) => {
      const probePort = probePorts[i] ?? displayPort
      return [displayPort, await tcpProbe(sensor.probe_host, probePort)] as const
    }),
  )
  return Object.fromEntries(pairs)
}

export function formatSensor(sensor: SensorRow, portStatus: Record<number, boolean>, online: boolean): SensorResult {
  return {
    sensorId:   sensor.sensor_id,
    clientId:   sensor.client_id,
    clientName: sensor.client_name,
    clientSlug: sensor.client_slug,
    clientCode: sensor.client_code ?? '',
    name:       sensor.name,
    protocol:   sensor.protocol,
    ip:         sensor.ip,
    version:    sensor.version,
    ports:      Array.isArray(sensor.ports) ? sensor.ports : [],
    probeHost:  sensor.probe_host,
    lastSeen:   sensor.last_seen,
    createdAt:  sensor.created_at,
    eventsTotal: Number(sensor.event_count),
    online,
    portStatus,
  }
}
