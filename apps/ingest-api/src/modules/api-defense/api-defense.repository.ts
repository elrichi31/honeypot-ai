import { Prisma, type PrismaClient } from '@prisma/client'

export type EventRow = { id: string; src_ip: string; method: string; path: string; user_agent: string; attack_type: string; details: string; status_code: number | null; timestamp: Date }
export type TypeCount = { attack_type: string; count: bigint }
export type IpCount = { src_ip: string; count: bigint }
export type AllowRow = { id: string; entry: string; label: string; created_at: Date }
export type BlockedRow = { id: string; ip: string; reason: string; auto_blocked: boolean; blocked_at: Date }

export class ApiDefenseRepository {
  constructor(private prisma: PrismaClient) {}

  async listEvents(args: { limit: number; offset: number; attackType?: string; ip?: string }): Promise<{ rows: EventRow[]; total: number }> {
    const { limit, offset, attackType, ip } = args
    const typeCond = attackType ? Prisma.sql`AND attack_type = ${attackType}` : Prisma.sql``
    const ipCond   = ip         ? Prisma.sql`AND src_ip = ${ip}`             : Prisma.sql``

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<EventRow[]>`
        SELECT id, src_ip, method, path, user_agent, attack_type, details::text, status_code, timestamp
        FROM api_defense_events
        WHERE 1=1 ${typeCond} ${ipCond}
        ORDER BY timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COUNT(*) AS total FROM api_defense_events WHERE 1=1 ${typeCond} ${ipCond}
      `,
    ])

    return { rows, total: Number(countRows[0]?.total ?? 0) }
  }

  async getSummary(todayStart: Date): Promise<{ typeCounts: TypeCount[]; topIps: IpCount[]; totalToday: number }> {
    const [typeCounts, topIps, totalToday] = await Promise.all([
      this.prisma.$queryRaw<TypeCount[]>`
        SELECT attack_type, COUNT(*)::bigint AS count FROM api_defense_events
        WHERE timestamp >= ${todayStart} GROUP BY attack_type ORDER BY count DESC
      `,
      this.prisma.$queryRaw<IpCount[]>`
        SELECT src_ip, COUNT(*)::bigint AS count FROM api_defense_events
        WHERE timestamp >= ${todayStart} GROUP BY src_ip ORDER BY count DESC LIMIT 10
      `,
      this.prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COUNT(*) AS total FROM api_defense_events WHERE timestamp >= ${todayStart}
      `,
    ])

    return { typeCounts, topIps, totalToday: Number(totalToday[0]?.total ?? 0) }
  }

  async listAllowlist(): Promise<AllowRow[]> {
    return this.prisma.$queryRaw<AllowRow[]>`
      SELECT id, entry, label, created_at FROM defense_allowlist ORDER BY created_at DESC
    `
  }

  async insertAllowlistEntry(id: string, entry: string, label: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO defense_allowlist (id, entry, label) VALUES (${id}, ${entry}, ${label})
    `
  }

  async deleteAllowlistEntry(id: string): Promise<number> {
    return this.prisma.$executeRaw`DELETE FROM defense_allowlist WHERE id = ${id}`
  }

  async listBlocked(): Promise<BlockedRow[]> {
    return this.prisma.$queryRaw<BlockedRow[]>`
      SELECT id, ip, reason, auto_blocked, blocked_at FROM blocked_ips ORDER BY blocked_at DESC
    `
  }

  async insertBlocked(id: string, ip: string, reason: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO blocked_ips (id, ip, reason, auto_blocked) VALUES (${id}, ${ip}, ${reason}, false)
    `
  }

  async deleteBlocked(id: string): Promise<number> {
    return this.prisma.$executeRaw`DELETE FROM blocked_ips WHERE id = ${id}`
  }
}
