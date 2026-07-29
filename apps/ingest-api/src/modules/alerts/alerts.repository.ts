import type { PrismaClient } from '@prisma/client'

export type AlertRow = {
  id: string
  alert_key: string
  level: string
  title: string
  description: string
  fields: unknown
  src_ip: string | null
  sensor_id: string | null
  client_id: string | null
  client_name: string | null
  read_at: Date | null
  created_at: Date
}

export type ClientCrowdStrikeConfig = {
  crowdstrike_hec_url: string
  crowdstrike_api_key: string
}

export class AlertRepository {
  constructor(private prisma: PrismaClient) {}

  async findClientIdBySensor(sensorId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ client_id: string | null }>>`
      SELECT client_id FROM sensors WHERE sensor_id = ${sensorId} LIMIT 1
    `
    return rows[0]?.client_id ?? null
  }

  async findRecentClientIdsByIp(ip: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ client_id: string }>>`
      SELECT DISTINCT sen.client_id
      FROM (
        SELECT sensor_id FROM sessions
        WHERE src_ip = ${ip} AND started_at >= NOW() - INTERVAL '24 hours'
        UNION
        SELECT sensor_id FROM web_hits
        WHERE src_ip = ${ip} AND timestamp >= NOW() - INTERVAL '24 hours'
        UNION
        SELECT sensor_id FROM protocol_hits
        WHERE src_ip = ${ip} AND timestamp >= NOW() - INTERVAL '24 hours'
      ) activity
      JOIN sensors sen ON sen.sensor_id = activity.sensor_id
      WHERE sen.client_id IS NOT NULL
      LIMIT 2
    `
    return rows.map((row) => row.client_id)
  }

  async findCrowdStrikeConfig(clientId: string): Promise<ClientCrowdStrikeConfig | null> {
    const rows = await this.prisma.$queryRaw<Array<ClientCrowdStrikeConfig>>`
      SELECT crowdstrike_hec_url, crowdstrike_api_key
      FROM clients
      WHERE id = ${clientId}
        AND crowdstrike_hec_url <> '' AND crowdstrike_api_key <> ''
      LIMIT 1
    `
    return rows[0] ?? null
  }

  async list(args: { limit: number; unreadOnly: boolean; clientId?: string; srcIp?: string }): Promise<AlertRow[]> {
    const { limit, unreadOnly, clientId, srcIp } = args
    return this.prisma.$queryRaw<AlertRow[]>`
      SELECT a.id, a.alert_key, a.level, a.title, a.description, a.fields,
             a.src_ip, a.sensor_id, a.client_id, c.name AS client_name,
             a.read_at, a.created_at
      FROM alerts a
      LEFT JOIN clients c ON c.id = a.client_id
      WHERE (${clientId ?? null}::text IS NULL OR a.client_id = ${clientId ?? null})
        AND (${srcIp ?? null}::text IS NULL OR a.src_ip = ${srcIp ?? null})
        AND (${unreadOnly} = false OR a.read_at IS NULL)
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `
  }

  async countUnread(clientId?: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM alerts
      WHERE read_at IS NULL
        AND (${clientId ?? null}::text IS NULL OR client_id = ${clientId ?? null})
    `
    return Number(rows[0]?.count ?? 0)
  }

  async markRead(id: string): Promise<number> {
    const result = await this.prisma.alert.updateMany({
      where: { id, readAt: null },
      data: { readAt: new Date() },
    })
    return result.count
  }

  async markAllRead(clientId?: string): Promise<number> {
    const result = await this.prisma.alert.updateMany({
      where: { readAt: null, ...(clientId ? { clientId } : {}) },
      data: { readAt: new Date() },
    })
    return result.count
  }

  async deleteAll(clientId?: string): Promise<number> {
    const result = await this.prisma.alert.deleteMany({
      where: clientId ? { clientId } : {},
    })
    return result.count
  }

  async deleteOne(id: string, clientId?: string): Promise<number> {
    const result = await this.prisma.alert.deleteMany({
      where: clientId ? { id, clientId } : { id },
    })
    return result.count
  }
}
