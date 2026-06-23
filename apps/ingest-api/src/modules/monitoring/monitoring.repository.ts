import type { PrismaClient } from '@prisma/client'

type BucketRow = {
  bucket: Date
  avg_cpu: number
  avg_ram_pct: number
  avg_ram_used_kb: number
  avg_ram_total_kb: number
}

type TopRow = { container: string }
type ContainerBucketRow = { container: string; bucket: Date; avg_cpu: number; avg_mem_mb: number }

export class MonitoringRepository {
  constructor(private prisma: PrismaClient) {}

  async getSystemHistory(since: Date, intervalSec: number): Promise<BucketRow[]> {
    return this.prisma.$queryRaw<BucketRow[]>`
      SELECT
        date_bin(
          (${intervalSec} || ' seconds')::interval,
          sampled_at,
          TIMESTAMP '2001-01-01'
        ) AS bucket,
        ROUND(AVG(cpu_load_1m)::numeric, 2)::float  AS avg_cpu,
        ROUND(AVG(ram_pct)::numeric, 1)::float       AS avg_ram_pct,
        ROUND(AVG(ram_used_kb)::numeric)::int        AS avg_ram_used_kb,
        ROUND(AVG(ram_total_kb)::numeric)::int       AS avg_ram_total_kb
      FROM monitoring_snapshots
      WHERE sampled_at >= ${since}
      GROUP BY bucket
      ORDER BY bucket ASC
    `
  }

  async getTopContainers(since: Date): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<TopRow[]>`
      SELECT container
      FROM container_snapshots
      WHERE sampled_at >= ${since}
      GROUP BY container
      ORDER BY AVG(cpu_pct) DESC
      LIMIT 6
    `
    return rows.map(r => r.container)
  }

  async getContainerHistory(since: Date, intervalSec: number, names: string[]): Promise<ContainerBucketRow[]> {
    return this.prisma.$queryRaw<ContainerBucketRow[]>`
      SELECT
        container,
        date_bin(
          (${intervalSec} || ' seconds')::interval,
          sampled_at,
          TIMESTAMP '2001-01-01'
        ) AS bucket,
        ROUND(AVG(cpu_pct)::numeric, 2)::float  AS avg_cpu,
        ROUND(AVG(mem_mb)::numeric,  1)::float  AS avg_mem_mb
      FROM container_snapshots
      WHERE sampled_at >= ${since}
        AND container = ANY(${names}::text[])
      GROUP BY container, bucket
      ORDER BY bucket ASC
    `
  }
}
