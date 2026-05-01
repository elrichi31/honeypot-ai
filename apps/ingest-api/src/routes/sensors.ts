import net from 'net'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'

const heartbeatSchema = z.object({
  sensorId:   z.string().min(1),
  name:       z.string().min(1),
  protocol:   z.enum(['ssh', 'ftp', 'mysql', 'port-scan', 'http']),
  ip:         z.string().default(''),
  version:    z.string().default(''),
  // Public-facing ports shown in the UI (e.g. 22 for SSH, 80 for HTTP)
  ports:      z.array(z.number().int().min(1).max(65535)).default([]),
  // Internal Docker ports used for TCP probing. When omitted, falls back to `ports`.
  // Needed when the container's internal port differs from the public port
  // (e.g. cowrie listens on 2222 internally but is exposed as 22).
  probePorts: z.array(z.number().int().min(1).max(65535)).default([]),
  // Docker service hostname — used for TCP probing instead of request.ip for sidecars.
  host:       z.string().default(''),
})

function tcpProbe(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise(resolve => {
    if (!host) return resolve(false)
    const sock = new net.Socket()
    let settled = false
    const finish = (up: boolean) => {
      if (!settled) { settled = true; sock.destroy(); resolve(up) }
    }
    sock.setTimeout(timeoutMs)
    sock.connect(port, host, () => finish(true))
    sock.on('error', () => finish(false))
    sock.on('timeout', () => finish(false))
  })
}

function normalizeIp(raw: string): string {
  // Strip IPv6-mapped IPv4 prefix (::ffff:1.2.3.4 → 1.2.3.4)
  return raw.replace(/^::ffff:/, '')
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
    // Use explicit Docker hostname if provided (beacon sidecars must set this so the
    // probe reaches the actual honeypot container, not the beacon).
    // Fall back to request.ip for honeypots that heartbeat themselves.
    const probeHost = d.host || normalizeIp(request.ip ?? '')

    const probePorts = d.probePorts.length > 0 ? d.probePorts : d.ports

    await fastify.prisma.$executeRaw`
      INSERT INTO sensors (id, sensor_id, name, protocol, ip, version, ports, probe_ports, probe_host, last_seen, created_at)
      VALUES (
        gen_random_uuid()::text, ${d.sensorId}, ${d.name}, ${d.protocol},
        ${d.ip}, ${d.version},
        CAST(${JSON.stringify(d.ports)} AS jsonb),
        CAST(${JSON.stringify(probePorts)} AS jsonb),
        ${probeHost},
        ${now}, ${now}
      )
      ON CONFLICT (sensor_id) DO UPDATE SET
        name        = EXCLUDED.name,
        protocol    = EXCLUDED.protocol,
        ip          = EXCLUDED.ip,
        version     = EXCLUDED.version,
        ports       = EXCLUDED.ports,
        probe_ports = EXCLUDED.probe_ports,
        probe_host  = EXCLUDED.probe_host,
        last_seen   = EXCLUDED.last_seen
    `

    return reply.status(200).send({ ok: true })
  })

  fastify.get('/sensors', async (_request, reply) => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)

    const sensors = await fastify.prisma.$queryRaw<Array<{
      sensor_id: string
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
          WHEN s.protocol = 'ssh' THEN (SELECT COUNT(*)::bigint FROM sessions)
          WHEN s.protocol = 'http' THEN (SELECT COUNT(*)::bigint FROM web_hits)
          ELSE COALESCE(ph.cnt, 0)
        END AS event_count
      FROM sensors s
      LEFT JOIN (
        SELECT protocol, COUNT(*) AS cnt
        FROM protocol_hits
        GROUP BY protocol
      ) ph ON ph.protocol = s.protocol
      ORDER BY s.last_seen DESC
    `

    // Probe all ports in parallel (2 s timeout each, all concurrent).
    // Uses probe_ports (internal Docker ports) for the TCP check, but maps results
    // back to the public-facing ports so the UI shows the right port numbers.
    const probeResults = await Promise.all(
      sensors.map(async s => {
        const displayPorts: number[] = Array.isArray(s.ports) ? s.ports : []
        const probePorts: number[]   = Array.isArray(s.probe_ports) && s.probe_ports.length > 0
          ? s.probe_ports
          : displayPorts
        if (!s.probe_host || displayPorts.length === 0) return {}
        const pairs = await Promise.all(
          displayPorts.map(async (displayPort, i) => {
            const probePort = probePorts[i] ?? displayPort
            return [displayPort, await tcpProbe(s.probe_host, probePort)] as const
          })
        )
        return Object.fromEntries(pairs)
      })
    )

    const result = sensors.map((s, i) => ({
      sensorId: s.sensor_id,
      name: s.name,
      protocol: s.protocol,
      ip: s.ip,
      version: s.version,
      ports: Array.isArray(s.ports) ? s.ports : [],
      probeHost: s.probe_host,
      lastSeen: s.last_seen,
      createdAt: s.created_at,
      eventsTotal: Number(s.event_count),
      online: s.last_seen > twoMinutesAgo,
      portStatus: probeResults[i] as Record<number, boolean>,
    }))

    // Only add synthetic SSH entry if no SSH beacon is registered yet
    const hasRegisteredSsh = result.some(s => s.protocol === 'ssh')
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
}
