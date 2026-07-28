import type { ClickHouseClient } from '@clickhouse/client'
import type { FastifyInstance } from 'fastify'
import { AnalyticsRepository, type TrendBucket } from './analytics.repository.js'
import { withCache } from '../../lib/cache-helper.js'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'

const RANGE_CONFIG = {
  '7d':  { days: 7,   granularity: 'hour' as const },
  '30d': { days: 30,  granularity: 'day'  as const },
  '90d': { days: 90,  granularity: 'day'  as const },
  '1y':  { days: 365, granularity: 'week' as const },
}

export type TrendRange = keyof typeof RANGE_CONFIG

// This is historical/aggregate data, not the live dashboard — a few minutes
// of staleness is fine and keeps repeat range/protocol toggling instant.
const TRENDS_TTL_SECONDS = 300

export class AnalyticsService {
  private repo: AnalyticsRepository | null

  constructor(ch: ClickHouseClient | null) {
    this.repo = ch ? new AnalyticsRepository(ch) : null
  }

  get enabled(): boolean {
    return this.repo !== null
  }

  async getTrends(
    cache: FastifyInstance['cache'],
    range: TrendRange,
    protocol: string | null,
    scope: ClickHouseScope,
  ): Promise<TrendBucket[]> {
    const repo = this.repo
    if (!repo) throw new Error('analytics_unavailable')

    const { days, granularity } = RANGE_CONFIG[range]
    const key = `analytics:trends:${range}:${protocol ?? 'all'}:${scope.cacheSuffix}`
    return withCache(cache, key, TRENDS_TTL_SECONDS, () =>
      repo.getTrends(days, granularity, protocol, scope),
    )
  }
}
