import type { PrismaClient } from '@prisma/client'

export type SessionRow = { src_ip: string; count: bigint }
export type WebRow = { src_ip: string; count: bigint }
export type ProtocolRow = { src_ip: string; protocol: string; count: bigint }
export type SensorRow = { sensor_id: string; ip: string; protocol: string }

export class AttacksTodayRepository {
  constructor(private prisma: PrismaClient) {}

  async getAttacksSince(since: Date): Promise<{ sshRows: SessionRow[]; webRows: WebRow[]; protocolRows: ProtocolRow[] }> {
    const [sshRows, webRows, protocolRows] = await Promise.all([
      this.prisma.$queryRaw<SessionRow[]>`
        SELECT src_ip, COUNT(*)::bigint AS count
        FROM sessions
        WHERE started_at >= ${since}
        GROUP BY src_ip
      `,
      this.prisma.$queryRaw<WebRow[]>`
        SELECT src_ip, COUNT(*)::bigint AS count
        FROM web_hits
        WHERE timestamp >= ${since}
        GROUP BY src_ip
      `,
      this.prisma.$queryRaw<ProtocolRow[]>`
        SELECT src_ip, protocol, COUNT(*)::bigint AS count
        FROM protocol_hits
        WHERE timestamp >= ${since}
        GROUP BY src_ip, protocol
      `,
    ])
    return { sshRows, webRows, protocolRows }
  }

  async getSensorLocations(): Promise<SensorRow[]> {
    return this.prisma.$queryRaw<SensorRow[]>`
      SELECT sensor_id, ip, protocol
      FROM sensors
      WHERE ip IS NOT NULL AND ip <> '' AND ip <> '-'
    `
  }
}
