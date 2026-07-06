import { Prisma, type PrismaClient } from '@prisma/client'

const DECEPTION_FILTER = Prisma.sql`(data->>'layer' = 'internal' OR data->>'source' = 'opencanary')`
const SESSION_FALLBACK_WINDOW = Prisma.sql`interval '2 hours'`

export type Scope = { clientId: string; sensorIds: string[] } | null

export type KillChainStepRow = {
  node_id: string | null; node_name: string | null; protocol: string; dst_port: number
  event_type: string; username: string | null; password: string | null
  timestamp: Date; public_ip: string | null; session_id: string | null; src_ip: string | null; logdata: unknown
  client_id: string | null; client_slug: string | null; client_name: string | null
}

function sensorScopeClause(scope: Scope, col = 'sensor_id'): Prisma.Sql {
  if (!scope) return Prisma.empty
  if (scope.sensorIds.length === 0) return Prisma.sql` AND false`
  return Prisma.sql` AND ${Prisma.raw(col)} = ANY(${scope.sensorIds}::text[])`
}

export class DeceptionRepository {
  constructor(private prismaRead: PrismaClient, private prisma: PrismaClient) {}

  async getOverview(scope: Scope) {
    const nodeWhere = scope
      ? Prisma.sql`protocol = 'deception' AND client_id = ${scope.clientId}`
      : Prisma.sql`protocol = 'deception'`
    const hitScope = sensorScopeClause(scope)

    const [nodes, activity] = await Promise.all([
      this.prismaRead.$queryRaw<Array<{ total: bigint; online: bigint }>>`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE last_seen >= NOW() - INTERVAL '2 minutes')::bigint AS online
        FROM sensors
        WHERE ${nodeWhere}
      `,
      this.prismaRead.$queryRaw<Array<{ hits_24h: bigint; hits_7d: bigint; auth_24h: bigint; unique_internal_ips: bigint; last_event: Date | null }>>`
        SELECT
          COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours')::bigint AS hits_24h,
          COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '7 days')::bigint  AS hits_7d,
          COUNT(*) FILTER (WHERE event_type = 'auth' AND timestamp >= NOW() - INTERVAL '24 hours')::bigint AS auth_24h,
          COUNT(DISTINCT src_ip)::bigint AS unique_internal_ips,
          MAX(timestamp) AS last_event
        FROM protocol_hits
        WHERE ${DECEPTION_FILTER}${hitScope}
      `,
    ])

    const n = nodes[0]; const a = activity[0]
    return {
      nodesTotal: Number(n?.total ?? 0), nodesOnline: Number(n?.online ?? 0),
      hits24h: Number(a?.hits_24h ?? 0), hits7d: Number(a?.hits_7d ?? 0),
      authAttempts24h: Number(a?.auth_24h ?? 0),
      uniqueInternalIps: Number(a?.unique_internal_ips ?? 0), lastEvent: a?.last_event ?? null,
    }
  }

  async getNodes(scope: Scope) {
    const sensorWhere = scope
      ? Prisma.sql`protocol = 'deception' AND client_id = ${scope.clientId}`
      : Prisma.sql`protocol = 'deception'`
    const hitScope = sensorScopeClause(scope)

    const [sensors, activity] = await Promise.all([
      this.prismaRead.$queryRaw<Array<{ sensor_id: string; name: string; ip: string; ports: unknown; last_seen: Date; real_protocol: string | null }>>`
        SELECT sensor_id, name, ip, ports, last_seen, real_protocol FROM sensors
        WHERE ${sensorWhere} ORDER BY ip ASC
      `,
      this.prismaRead.$queryRaw<Array<{ node_id: string; hits: bigint; auth_attempts: bigint; last_hit: Date | null }>>`
        SELECT COALESCE(data->>'node_id', sensor_id) AS node_id, COUNT(*)::bigint AS hits,
          COUNT(*) FILTER (WHERE event_type = 'auth')::bigint AS auth_attempts,
          MAX(timestamp) AS last_hit
        FROM protocol_hits
        WHERE ${DECEPTION_FILTER} AND COALESCE(data->>'node_id', sensor_id) IS NOT NULL${hitScope}
        GROUP BY COALESCE(data->>'node_id', sensor_id)
      `,
    ])

    const byNode = new Map(activity.map(r => [r.node_id, r]))
    const now = Date.now()
    return sensors.map(s => {
      const act = byNode.get(s.sensor_id)
      return {
        sensorId: s.sensor_id, name: s.name, ip: s.ip,
        ports: Array.isArray(s.ports) ? s.ports : [],
        online: now - new Date(s.last_seen).getTime() < 2 * 60 * 1000,
        lastSeen: s.last_seen,
        realProtocol: s.real_protocol ?? null,
        hits: Number(act?.hits ?? 0), authAttempts: Number(act?.auth_attempts ?? 0), lastHit: act?.last_hit ?? null,
      }
    })
  }

  async getKillchain(scope: Scope, limit: number): Promise<KillChainStepRow[]> {
    const hitScope = sensorScopeClause(scope, 'ph.sensor_id')
    return this.prismaRead.$queryRaw<KillChainStepRow[]>`
      SELECT COALESCE(ph.data->>'node_id', ph.sensor_id) AS node_id, sn.name AS node_name, ph.protocol, ph.dst_port,
             ph.event_type, ph.username, ph.password, ph.timestamp, ph.src_ip AS src_ip,
             ph.data->'logdata' AS logdata, s.src_ip AS public_ip, s.id AS session_id,
             c.id AS client_id, c.slug AS client_slug, c.name AS client_name
      FROM protocol_hits ph
      LEFT JOIN sensors sn ON sn.sensor_id = COALESCE(ph.data->>'node_id', ph.sensor_id)
      LEFT JOIN clients c ON c.id = sn.client_id
      LEFT JOIN LATERAL (
        SELECT s.id, s.src_ip FROM sessions s
        WHERE ph.timestamp >= s.started_at
          AND ph.timestamp <= COALESCE(s.ended_at, s.started_at + ${SESSION_FALLBACK_WINDOW})
        ORDER BY s.started_at DESC LIMIT 1
      ) s ON true
      WHERE ${DECEPTION_FILTER}${hitScope}
      ORDER BY ph.timestamp DESC LIMIT ${limit}
    `
  }

  async getEvents(scope: Scope, page: number, limit: number, nodeId: string | null) {
    const offset = (page - 1) * limit
    const rowsScope = sensorScopeClause(scope, 'ph.sensor_id')
    const countScope = sensorScopeClause(scope, 'sensor_id')
    const rowsNodeClause = nodeId ? Prisma.sql` AND COALESCE(ph.data->>'node_id', ph.sensor_id) = ${nodeId}` : Prisma.empty
    const countNodeClause = nodeId ? Prisma.sql` AND COALESCE(data->>'node_id', sensor_id) = ${nodeId}` : Prisma.empty

    const [rows, countRows] = await Promise.all([
      this.prismaRead.$queryRaw<Array<{
        id: string; node_id: string | null; node_name: string | null; protocol: string
        src_ip: string; src_port: number | null; dst_port: number; event_type: string
        username: string | null; password: string | null; timestamp: Date
        logtype: number | null; logdata: unknown; dst_host: string | null
        client_id: string | null; client_slug: string | null; client_name: string | null
      }>>`
        SELECT ph.id, COALESCE(ph.data->>'node_id', ph.sensor_id) AS node_id, sn.name AS node_name, ph.protocol,
               ph.src_ip, ph.src_port, ph.dst_port, ph.event_type, ph.username, ph.password, ph.timestamp,
               (ph.data->>'logtype')::int AS logtype, ph.data->'logdata' AS logdata, ph.data->>'dst_host' AS dst_host,
               c.id AS client_id, c.slug AS client_slug, c.name AS client_name
        FROM protocol_hits ph
        LEFT JOIN sensors sn ON sn.sensor_id = COALESCE(ph.data->>'node_id', ph.sensor_id)
        LEFT JOIN clients c ON c.id = sn.client_id
        WHERE ${DECEPTION_FILTER}${rowsNodeClause}${rowsScope}
        ORDER BY ph.timestamp DESC LIMIT ${limit} OFFSET ${offset}
      `,
      this.prismaRead.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) FROM protocol_hits
        WHERE ${DECEPTION_FILTER}${countNodeClause}${countScope}
      `,
    ])

    return { data: rows, meta: { page, limit, total: Number(countRows[0]?.count ?? 0) } }
  }

  async ingestPortscan(body: { id: string; sensorId: string; srcIp: string; dstPorts: number[]; nodeId?: string; scanType: string; timestamp: string }): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO deception_portscans (id, sensor_id, timestamp, src_ip, dst_ports, node_id, scan_type)
      VALUES (${body.id}, ${body.sensorId}, ${body.timestamp}::timestamptz, ${body.srcIp}, ${body.dstPorts}::integer[], ${body.nodeId ?? null}, ${body.scanType})
      ON CONFLICT (id) DO NOTHING
    `
  }

  async getPortscans(scope: Scope, page: number, limit: number, nodeId: string | null) {
    const offset = (page - 1) * limit
    const rowsScope = sensorScopeClause(scope, 'dp.sensor_id')
    const countScope = sensorScopeClause(scope, 'sensor_id')
    const rowsNodeClause = nodeId ? Prisma.sql` AND dp.node_id = ${nodeId}` : Prisma.empty
    const countNodeClause = nodeId ? Prisma.sql` AND node_id = ${nodeId}` : Prisma.empty

    const [rows, countRows] = await Promise.all([
      this.prismaRead.$queryRaw<Array<{
        id: string; sensor_id: string; timestamp: Date; src_ip: string; dst_ports: number[]; node_id: string | null; scan_type: string
        client_id: string | null; client_slug: string | null; client_name: string | null
      }>>`
        SELECT dp.id, dp.sensor_id, dp.timestamp, dp.src_ip, dp.dst_ports, dp.node_id, dp.scan_type,
               c.id AS client_id, c.slug AS client_slug, c.name AS client_name
        FROM deception_portscans dp
        LEFT JOIN sensors sn ON sn.sensor_id = dp.sensor_id
        LEFT JOIN clients c ON c.id = sn.client_id
        WHERE true${rowsScope}${rowsNodeClause}
        ORDER BY dp.timestamp DESC LIMIT ${limit} OFFSET ${offset}
      `,
      this.prismaRead.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) FROM deception_portscans WHERE true${countScope}${countNodeClause}
      `,
    ])

    return { data: rows, meta: { page, limit, total: Number(countRows[0]?.count ?? 0) } }
  }
}
