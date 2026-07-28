import type { ClickHouseClient } from '@clickhouse/client'
import type { FastifyInstance } from 'fastify'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'
import { withCache } from '../../lib/cache-helper.js'
import {
  ANALYTICS_RANGE_CONFIG,
  type TrendRange,
} from './analytics.service.js'
import {
  AnalyticsSuricataRepository,
  type SuricataTrendGroup,
} from './analytics-suricata.repository.js'

export type SuricataTrendPoint = {
  bucket: string
  group: string
  count: number
  severity: number
}

export type SuricataTrendTotal = {
  group: string
  count: number
  severity: number
}

export type SuricataTrends = {
  data: SuricataTrendPoint[]
  top: SuricataTrendTotal[]
}

const SURICATA_TRENDS_TTL_SECONDS = 600

export class AnalyticsSuricataService {
  private repo: AnalyticsSuricataRepository | null

  constructor(ch: ClickHouseClient | null) {
    this.repo = ch ? new AnalyticsSuricataRepository(ch) : null
  }

  get enabled(): boolean {
    return this.repo !== null
  }

  async getTrends(
    cache: FastifyInstance['cache'],
    range: TrendRange,
    groupBy: SuricataTrendGroup,
    limit: number,
    scope: ClickHouseScope,
  ): Promise<SuricataTrends> {
    const repo = this.repo
    if (!repo) throw new Error('analytics_unavailable')

    const { days, granularity } = ANALYTICS_RANGE_CONFIG[range]
    const cacheKey = `analytics:suricata:${range}:${groupBy}:${limit}:${scope.cacheSuffix}`
    return withCache(cache, cacheKey, SURICATA_TRENDS_TTL_SECONDS, async () => {
      const rows = await repo.getTrends(days, granularity, groupBy, limit, scope)
      const data = rows.map((row) => ({
        bucket: row.bucket,
        group: row.name,
        count: Number(row.count),
        severity: Number(row.severity),
      }))
      return { data, top: aggregateTotals(data) }
    })
  }
}

function aggregateTotals(data: SuricataTrendPoint[]): SuricataTrendTotal[] {
  const totals = new Map<string, SuricataTrendTotal>()
  for (const row of data) {
    const current = totals.get(row.group)
    totals.set(row.group, {
      group: row.group,
      count: (current?.count ?? 0) + row.count,
      severity: Math.min(current?.severity ?? row.severity, row.severity),
    })
  }
  return [...totals.values()].sort((a, b) => b.count - a.count || a.group.localeCompare(b.group))
}
