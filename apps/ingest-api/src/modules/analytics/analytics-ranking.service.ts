import type { ClickHouseClient } from '@clickhouse/client'
import type { FastifyInstance } from 'fastify'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'
import { withCache } from '../../lib/cache-helper.js'
import { ANALYTICS_RANGE_CONFIG, type TrendRange } from './analytics.service.js'
import {
  AnalyticsRankingRepository,
  type TopAttackerRow,
} from './analytics-ranking.repository.js'

const RANKING_TTL_SECONDS = 600

export class AnalyticsRankingService {
  private repo: AnalyticsRankingRepository | null

  constructor(ch: ClickHouseClient | null) {
    this.repo = ch ? new AnalyticsRankingRepository(ch) : null
  }

  get enabled(): boolean {
    return this.repo !== null
  }

  async getTopAttackers(
    cache: FastifyInstance['cache'],
    range: TrendRange,
    limit: number,
    scope: ClickHouseScope,
  ): Promise<TopAttackerRow[]> {
    const repo = this.repo
    if (!repo) throw new Error('analytics_unavailable')

    const { days } = ANALYTICS_RANGE_CONFIG[range]
    const cacheKey = `analytics:top-attackers:${range}:${limit}:${scope.cacheSuffix}`
    return withCache(cache, cacheKey, RANKING_TTL_SECONDS, async () => {
      const rows = await repo.getTopAttackers(days, limit, scope)
      return rows.map((row) => ({
        ...row,
        count: Number(row.count),
        sources: [...row.sources].sort(),
      }))
    })
  }
}
