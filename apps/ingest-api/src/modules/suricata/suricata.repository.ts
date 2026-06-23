import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'

const NOISE_PATTERN = "signature NOT ILIKE 'SURICATA %'"

export type AlertRow = {
  id: string; sensor_id: string; timestamp: Date
  src_ip: string; src_port: number | null; dest_ip: string; dest_port: number | null
  proto: string; action: string; signature_id: number; signature: string
  category: string; severity: number; flow_id: bigint | null; in_iface: string | null
}

export type EveAlert = {
  timestamp: string; flow_id?: number; in_iface?: string
  src_ip: string; src_port?: number; dest_ip: string; dest_port?: number
  proto: string; sensor_id: string
  alert: { action: string; signature_id: number; signature: string; category: string; severity: number }
}

export class SuricataRepository {
  constructor(private prisma: PrismaClient) {}

  async insertBatch(rows: Array<{ alert: EveAlert; ts: Date }>): Promise<void> {
    const values = rows.map(({ alert, ts }) =>
      Prisma.sql`(
        gen_random_uuid()::text, ${alert.sensor_id}, ${ts}, ${alert.src_ip},
        ${alert.src_port ?? null}, ${alert.dest_ip}, ${alert.dest_port ?? null},
        ${alert.proto}, ${alert.alert.action}, ${alert.alert.signature_id},
        ${alert.alert.signature}, ${alert.alert.category}, ${alert.alert.severity},
        ${alert.flow_id ?? null}, ${alert.in_iface ?? null}
      )`
    )
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO suricata_alerts (
        id, sensor_id, timestamp, src_ip, src_port, dest_ip, dest_port,
        proto, action, signature_id, signature, category, severity, flow_id, in_iface
      ) VALUES ${Prisma.join(values)}
      ON CONFLICT DO NOTHING
    `)
  }

  async listAlerts(prismaRead: PrismaClient, filters: string, pageSize: number, offset: number): Promise<AlertRow[]> {
    return prismaRead.$queryRawUnsafe<AlertRow[]>(`
      SELECT id, sensor_id, timestamp, src_ip, src_port, dest_ip, dest_port,
             proto, action, signature_id, signature, category, severity, flow_id, in_iface
      FROM suricata_alerts
      WHERE 1=1 ${filters}
      ORDER BY timestamp DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `)
  }

  async countAlerts(prismaRead: PrismaClient, filters: string): Promise<number> {
    const rows = await prismaRead.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT COUNT(*) AS count FROM suricata_alerts WHERE 1=1 ${filters}
    `)
    return Number(rows[0]?.count ?? 0)
  }

  async getStats(prismaRead: PrismaClient, interval: string, trunc: string, ownIpFilter: string) {
    const [totals, threatTotals, topSigs, topThreatSigs, topSources, timeline] = await Promise.all([
      prismaRead.$queryRawUnsafe<Array<{ total: bigint; critical: bigint; high: bigint; medium: bigint; low: bigint }>>(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE severity = 1) AS critical,
          COUNT(*) FILTER (WHERE severity = 2) AS high,
          COUNT(*) FILTER (WHERE severity = 3) AS medium,
          COUNT(*) FILTER (WHERE severity = 4) AS low
        FROM suricata_alerts
        WHERE timestamp > NOW() - INTERVAL '${interval}'
      `),
      prismaRead.$queryRawUnsafe<Array<{ total: bigint; critical: bigint; high: bigint; medium: bigint; low: bigint }>>(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE severity = 1) AS critical,
          COUNT(*) FILTER (WHERE severity = 2) AS high,
          COUNT(*) FILTER (WHERE severity = 3) AS medium,
          COUNT(*) FILTER (WHERE severity = 4) AS low
        FROM suricata_alerts
        WHERE timestamp > NOW() - INTERVAL '${interval}'
          AND ${NOISE_PATTERN} ${ownIpFilter}
      `),
      prismaRead.$queryRawUnsafe<Array<{ signature: string; count: bigint; severity: number }>>(`
        SELECT signature, severity, COUNT(*) AS count
        FROM suricata_alerts
        WHERE timestamp > NOW() - INTERVAL '${interval}'
        GROUP BY signature, severity ORDER BY count DESC LIMIT 10
      `),
      prismaRead.$queryRawUnsafe<Array<{ signature: string; count: bigint; severity: number; category: string }>>(`
        SELECT signature, severity, category, COUNT(*) AS count
        FROM suricata_alerts
        WHERE timestamp > NOW() - INTERVAL '${interval}'
          AND ${NOISE_PATTERN} ${ownIpFilter}
        GROUP BY signature, severity, category ORDER BY count DESC LIMIT 10
      `),
      prismaRead.$queryRawUnsafe<Array<{ src_ip: string; count: bigint }>>(`
        SELECT src_ip, COUNT(*) AS count
        FROM suricata_alerts
        WHERE timestamp > NOW() - INTERVAL '${interval}'
          ${ownIpFilter} AND ${NOISE_PATTERN}
        GROUP BY src_ip ORDER BY count DESC LIMIT 10
      `),
      prismaRead.$queryRawUnsafe<Array<{ bucket: Date; total: bigint; threats: bigint }>>(`
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
    return { totals, threatTotals, topSigs, topThreatSigs, topSources, timeline }
  }
}
