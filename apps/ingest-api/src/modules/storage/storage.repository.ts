import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'

type TableSize  = { table_name: string; total_bytes: bigint }
type PeriodCount = { period: Date; count: bigint }
type AvgRowSize = { table_name: string; avg_bytes: number }

export class StorageRepository {
  constructor(private prisma: PrismaClient) {}

  async getTableSizes(): Promise<Array<{ name: string; bytes: number }>> {
    const tables = await this.prisma.$queryRaw<TableSize[]>`
      SELECT relname AS table_name, pg_total_relation_size(relid) AS total_bytes
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY total_bytes DESC
    `
    return tables.map(t => ({ name: t.table_name, bytes: Number(t.total_bytes) }))
  }

  async getDatabaseSize(): Promise<number> {
    const rows = await this.prisma.$queryRaw<[{ size: bigint }]>`
      SELECT pg_database_size(current_database()) AS size
    `
    return Number(rows[0]?.size ?? 0)
  }

  async getAvgRowSizes(): Promise<Record<string, number>> {
    const rows = await this.prisma.$queryRaw<AvgRowSize[]>`
      SELECT c.relname AS table_name,
        CASE WHEN c.reltuples > 0
          THEN pg_total_relation_size(c.oid)::float / c.reltuples
          ELSE 512
        END AS avg_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('events', 'web_hits', 'protocol_hits', 'api_defense_events')
    `
    return Object.fromEntries(rows.map(r => [r.table_name, r.avg_bytes]))
  }

  async getIngestionCounts(trunc: string, intervalSql: string): Promise<{
    ssh: PeriodCount[]; web: PeriodCount[]; protocol: PeriodCount[]; defense: PeriodCount[]
  }> {
    const intervalRaw = Prisma.raw(`'${intervalSql}'`)
    const [ssh, web, protocol, defense] = await Promise.all([
      this.prisma.$queryRaw<PeriodCount[]>(Prisma.sql`
        SELECT date_trunc(${trunc}, event_ts) AS period, COUNT(*)::bigint AS count
        FROM events WHERE event_ts >= NOW() - INTERVAL ${intervalRaw}
        GROUP BY period ORDER BY period`),
      this.prisma.$queryRaw<PeriodCount[]>(Prisma.sql`
        SELECT date_trunc(${trunc}, timestamp) AS period, COUNT(*)::bigint AS count
        FROM web_hits WHERE timestamp >= NOW() - INTERVAL ${intervalRaw}
        GROUP BY period ORDER BY period`),
      this.prisma.$queryRaw<PeriodCount[]>(Prisma.sql`
        SELECT date_trunc(${trunc}, timestamp) AS period, COUNT(*)::bigint AS count
        FROM protocol_hits WHERE timestamp >= NOW() - INTERVAL ${intervalRaw}
        GROUP BY period ORDER BY period`),
      this.prisma.$queryRaw<PeriodCount[]>(Prisma.sql`
        SELECT date_trunc(${trunc}, timestamp) AS period, COUNT(*)::bigint AS count
        FROM api_defense_events WHERE timestamp >= NOW() - INTERVAL ${intervalRaw}
        GROUP BY period ORDER BY period`),
    ])
    return { ssh, web, protocol, defense }
  }

  async getRetentionRowStats(
    realTable: string,
    col: string,
    retentionDays: number,
    extraWhere: string,
    pendingExtra: string,
  ): Promise<{ days: number | null; pending: number }> {
    try {
      const res = await this.prisma.$queryRawUnsafe<[{ days: number | null; pending: bigint }]>(
        `SELECT
           EXTRACT(EPOCH FROM (NOW() - MIN("${col}"))) / 86400 AS days,
           COUNT(*) FILTER (WHERE "${col}" < NOW() - (${retentionDays} * INTERVAL '1 day') ${pendingExtra}) AS pending
         FROM "${realTable}" ${extraWhere}`
      )
      return {
        days: res[0]?.days != null ? Math.floor(Number(res[0].days)) : null,
        pending: res[0]?.pending != null ? Number(res[0].pending) : 0,
      }
    } catch {
      return { days: null, pending: 0 }
    }
  }

  async updateRetentionSetting(id: string, retentionDays?: number, enabled?: boolean): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE retention_settings
      SET
        retention_days = COALESCE(${retentionDays ?? null}, retention_days),
        enabled        = COALESCE(${enabled ?? null},       enabled),
        updated_at     = now()
      WHERE id = ${id}
    `
  }
}
