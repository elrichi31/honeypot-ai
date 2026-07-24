import type { FastifyInstance } from 'fastify'
import { tcpProbe, normalizeSlug, clientNameFromSlug } from './sensor-utils.js'

export type ClientRef = { id: string | null; name: string | null; slug: string | null }

export type SensorRow = {
  sensor_id: string; client_id: string | null; client_name: string | null
  client_slug: string | null; client_code: string | null; name: string
  protocol: string; ip: string; version: string; ports: number[]
  probe_ports: number[]; probe_host: string; last_seen: Date
  port_status: Record<string, boolean> | null
  created_at: Date; event_count: bigint
  owner_type: string; application_id: string | null; application_name: string | null
  real_protocol: string | null
}

export type SensorResult = {
  sensorId: string; clientId: string | null; clientName: string | null
  clientSlug: string | null; clientCode: string; name: string
  protocol: string; ip: string; version: string; ports: number[]
  probeHost: string; lastSeen: Date; createdAt: Date
  eventsTotal: number; online: boolean; degraded: boolean; portStatus: Record<number, boolean>
  // True when portStatus came from the sensor's own heartbeat (trustworthy for
  // remote sensors); false when it's the server-side TCP probe (meaningless for
  // sensors the ingest host can't reach).
  portStatusReported: boolean
  ownerType: string; applicationId: string | null; applicationName: string | null
  realProtocol: string | null
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
  // Event counts come from per-table GROUP BYs joined by sensor_id, not a
  // correlated COUNT subquery per sensor row. The old form re-scanned a big table
  // once for every sensor on every /sensors load (every ~30s); these aggregates
  // each scan once and the planner can use the sensor_id indexes. Even though
  // this is a read, it must stay on the primary because heartbeat freshness
  // drives online/offline status and replica lag can falsely mark all sensors
  // offline at once.
  return fastify.prisma.$queryRaw<SensorRow[]>`
    WITH ssh_counts AS (
      SELECT sensor_id, COUNT(*)::bigint AS n FROM sessions GROUP BY sensor_id
    ),
    web_counts AS (
      SELECT sensor_id, COUNT(*)::bigint AS n FROM web_hits GROUP BY sensor_id
    ),
    proto_counts AS (
      -- sensor_id is backfilled from data->>'sensor'; COALESCE covers the few old
      -- rows where it wasn't, counting each hit once under its effective sensor.
      SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id, COUNT(*)::bigint AS n
      FROM protocol_hits
      WHERE COALESCE(sensor_id, data->>'sensor') IS NOT NULL
      GROUP BY COALESCE(sensor_id, data->>'sensor')
    )
    SELECT
      s.sensor_id, c.id AS client_id, c.name AS client_name, c.slug AS client_slug,
      c.code AS client_code, s.name, s.protocol, s.ip, s.version,
      s.ports, s.probe_ports, s.probe_host, s.last_seen, s.created_at, s.real_protocol,
      COALESCE(
        CASE
          WHEN s.protocol = 'ssh'  THEN sc.n
          WHEN s.protocol = 'http' THEN wc.n
          ELSE pc.n
        END, 0
      )::bigint AS event_count
    FROM sensors s
    LEFT JOIN clients c     ON c.id = s.client_id
    LEFT JOIN ssh_counts sc ON sc.sensor_id = s.sensor_id
    LEFT JOIN web_counts wc ON wc.sensor_id = s.sensor_id
    LEFT JOIN proto_counts pc ON pc.sensor_id = s.sensor_id
    ORDER BY s.last_seen DESC
  `
}

// The sensor self-reports port open/closed in its heartbeat (keyed by display
// port as a JSON string). When present it's authoritative — probed from the
// honeypot's own vantage, so it works for remote sensors the ingest host can't
// reach. Empty means an old sensor that doesn't self-report yet → fall back to
// the server-side TCP probe.
export function reportedPortStatus(sensor: SensorRow): Record<number, boolean> | null {
  const raw = sensor.port_status
  if (!raw || typeof raw !== 'object') return null
  const entries = Object.entries(raw)
  if (entries.length === 0) return null
  const out: Record<number, boolean> = {}
  for (const [k, v] of entries) {
    const n = Number(k)
    if (Number.isFinite(n)) out[n] = Boolean(v)
  }
  return Object.keys(out).length > 0 ? out : null
}

export async function probeSensorPorts(sensor: SensorRow): Promise<Record<number, boolean>> {
  const displayPorts  = Array.isArray(sensor.ports)       ? sensor.ports       : []
  const probePorts    = Array.isArray(sensor.probe_ports) && sensor.probe_ports.length > 0
    ? sensor.probe_ports
    : displayPorts

  if (!sensor.probe_host || displayPorts.length === 0) return {}

  // Probes run in parallel, so the slowest port bounds the total time. Use a
  // timeout below the list's cold-wait cap (1800ms) so one filtered/closed port
  // can't push an otherwise-healthy sensor past the cap and lose its result.
  const PROBE_TIMEOUT_MS = 1500
  const pairs = await Promise.all(
    displayPorts.map(async (displayPort, i) => {
      const probePort = probePorts[i] ?? displayPort
      return [displayPort, await tcpProbe(sensor.probe_host, probePort, PROBE_TIMEOUT_MS)] as const
    }),
  )
  return Object.fromEntries(pairs)
}

export function formatSensor(sensor: SensorRow, portStatus: Record<number, boolean>, online: boolean, portStatusReported = false): SensorResult {
  // A sensor is degraded when the heartbeat is active (online) but the TCP probe
  // finds all monitored ports closed — the container is up but the process crashed.
  // Only applies when we actually have probe results (portStatus not empty).
  const probeValues = Object.values(portStatus)
  const degraded = online && probeValues.length > 0 && probeValues.every((up) => !up)
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
    degraded,
    portStatus,
    portStatusReported,
    ownerType:       sensor.owner_type ?? 'application',
    applicationId:   sensor.application_id ?? null,
    applicationName: sensor.application_name ?? null,
    realProtocol:    sensor.real_protocol ?? null,
  }
}
