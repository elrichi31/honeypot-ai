import type { PrismaClient } from '@prisma/client'
import { MonitoringRepository } from './monitoring.repository.js'

const RANGE_CONFIG = {
  '24h': { intervalMinutes: 5,   lookbackMs: 24 * 60 * 60 * 1000 },
  '7d':  { intervalMinutes: 60,  lookbackMs: 7  * 24 * 60 * 60 * 1000 },
  '30d': { intervalMinutes: 240, lookbackMs: 30 * 24 * 60 * 60 * 1000 },
} as const

export type Range = keyof typeof RANGE_CONFIG

export class MonitoringService {
  private repo: MonitoringRepository

  constructor(prisma: PrismaClient) {
    this.repo = new MonitoringRepository(prisma)
  }

  async getSystemHistory(range: Range) {
    const cfg = RANGE_CONFIG[range]
    const since = new Date(Date.now() - cfg.lookbackMs)
    const intervalSec = cfg.intervalMinutes * 60
    const rows = await this.repo.getSystemHistory(since, intervalSec)
    return rows.map(r => ({
      ts:         r.bucket.toISOString(),
      cpu:        r.avg_cpu,
      ramPct:     r.avg_ram_pct,
      ramUsedKb:  r.avg_ram_used_kb,
      ramTotalKb: r.avg_ram_total_kb,
    }))
  }

  async getContainerHistory(range: Range) {
    const cfg = RANGE_CONFIG[range]
    const since = new Date(Date.now() - cfg.lookbackMs)
    const intervalSec = cfg.intervalMinutes * 60

    const names = await this.repo.getTopContainers(since)
    if (names.length === 0) return []

    const rows = await this.repo.getContainerHistory(since, intervalSec, names)

    const bucketMap = new Map<string, Record<string, { cpu: number; mem: number }>>()
    for (const r of rows) {
      const ts = r.bucket.toISOString()
      if (!bucketMap.has(ts)) bucketMap.set(ts, {})
      bucketMap.get(ts)![r.container] = { cpu: r.avg_cpu, mem: r.avg_mem_mb }
    }

    return {
      containers: names,
      points: Array.from(bucketMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ts, values]) => ({ ts, ...Object.fromEntries(
          names.flatMap(n => [
            [`${n}__cpu`, values[n]?.cpu ?? null],
            [`${n}__mem`, values[n]?.mem ?? null],
          ])
        )})),
    }
  }
}
