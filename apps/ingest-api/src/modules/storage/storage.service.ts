import { statfs } from 'fs/promises'
import type { PrismaClient } from '@prisma/client'
import { StorageRepository } from './storage.repository.js'
import { getRetentionIntervalMinutes } from '../../lib/runtime-config.js'

const RANGE_CONFIG = {
  '24h': { trunc: 'hour', slots: 24, intervalSql: '24 hours' },
  '7d':  { trunc: 'day',  slots: 7,  intervalSql: '7 days'   },
  '30d': { trunc: 'day',  slots: 30, intervalSql: '30 days'  },
} as const

export type Range = keyof typeof RANGE_CONFIG

const TIMESTAMP_COL: Record<string, string> = {
  events:             'event_ts',
  sessions:           'started_at',
  web_hits:           'timestamp',
  protocol_hits:      'timestamp',
  api_defense_events: 'timestamp',
  suricata_alerts:    'timestamp',
}

const LOGICAL_TABLE: Record<string, { realTable: string; col: string; extra: string }> = {
  sessions:             { realTable: 'sessions', col: 'started_at', extra: 'login_success IS DISTINCT FROM true' },
  sessions_compromised: { realTable: 'sessions', col: 'started_at', extra: 'login_success = true' },
}

async function getDiskStats() {
  try {
    const s = await statfs('/')
    const total = Number(BigInt(s.blocks) * BigInt(s.bsize))
    const free  = Number(BigInt(s.bfree)  * BigInt(s.bsize))
    return { totalBytes: total, freeBytes: free, usedBytes: total - free }
  } catch {
    return { totalBytes: 0, freeBytes: 0, usedBytes: 0 }
  }
}

export class StorageService {
  private repo: StorageRepository

  constructor(private prisma: PrismaClient) {
    this.repo = new StorageRepository(prisma)
  }

  async getStats() {
    const [disk, tables, dbSize] = await Promise.all([
      getDiskStats(),
      this.repo.getTableSizes(),
      this.repo.getDatabaseSize(),
    ])
    return { disk, db: { totalBytes: dbSize, tables } }
  }

  async getIngestion(range: Range) {
    const { trunc, slots, intervalSql } = RANGE_CONFIG[range]
    const avg = await this.repo.getAvgRowSizes()
    const { ssh, web, protocol, defense } = await this.repo.getIngestionCounts(trunc, intervalSql)

    const buckets: Record<string, { ssh: number; web: number; protocol: number; defense: number }> = {}
    const now = new Date()
    for (let i = slots - 1; i >= 0; i--) {
      const d = new Date(now)
      if (trunc === 'hour') { d.setMinutes(0, 0, 0); d.setHours(d.getHours() - i) }
      else                  { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i) }
      buckets[d.toISOString()] = { ssh: 0, web: 0, protocol: 0, defense: 0 }
    }

    const fill = (rows: Array<{ period: Date; count: bigint }>, key: 'ssh' | 'web' | 'protocol' | 'defense', table: string) => {
      const a = avg[table] ?? 512
      for (const r of rows) {
        const d = new Date(r.period)
        if (trunc === 'hour') { d.setMinutes(0, 0, 0) }
        else                  { d.setHours(0, 0, 0, 0) }
        const k = d.toISOString()
        if (buckets[k]) buckets[k][key] = Math.round(Number(r.count) * a)
      }
    }
    fill(ssh,      'ssh',      'events')
    fill(web,      'web',      'web_hits')
    fill(protocol, 'protocol', 'protocol_hits')
    fill(defense,  'defense',  'api_defense_events')

    return Object.entries(buckets).map(([period, v]) => ({ period, ...v }))
  }

  async getRetention() {
    const rows = await this.prisma.retentionSettings.findMany({ orderBy: { tableName: 'asc' } })

    const perTableResults = await Promise.all(
      rows.map(async row => {
        const logical = LOGICAL_TABLE[row.tableName]
        const realTable = logical?.realTable ?? row.tableName
        const col = logical?.col ?? TIMESTAMP_COL[row.tableName]
        if (!col) return { id: row.id, oldestDaysAgo: null, pendingRows: null }
        const extraWhere = logical ? `WHERE ${logical.extra}` : ''
        const pendingExtra = logical ? `AND ${logical.extra}` : ''
        const { days, pending } = await this.repo.getRetentionRowStats(realTable, col, row.retentionDays, extraWhere, pendingExtra)
        return { id: row.id, oldestDaysAgo: days, pendingRows: pending }
      })
    )

    const byId = Object.fromEntries(perTableResults.map(r => [r.id, r]))
    const settings = rows.map(r => ({
      ...r,
      oldestDaysAgo: byId[r.id]?.oldestDaysAgo ?? null,
      pendingRows: byId[r.id]?.pendingRows ?? null,
    }))

    const lastRun = await this.prisma.retentionRun.findFirst({ orderBy: { startedAt: 'desc' } })
    const intervalMinutes = getRetentionIntervalMinutes()
    const nextRunAt = lastRun
      ? new Date(new Date(lastRun.startedAt).getTime() + intervalMinutes * 60 * 1000).toISOString()
      : null

    return { settings, lastRun, nextRunAt, intervalMinutes }
  }

  async updateRetention(id: string, retentionDays?: number, enabled?: boolean) {
    const updated = await this.repo.updateRetentionSetting(id, retentionDays, enabled)
    if (updated === 0) return null
    return this.prisma.retentionSettings.findUnique({ where: { id } })
  }
}
