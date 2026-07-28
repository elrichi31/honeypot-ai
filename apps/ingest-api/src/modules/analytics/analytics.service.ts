import type { ClickHouseClient } from '@clickhouse/client'
import type { FastifyInstance } from 'fastify'
import { AnalyticsRepository, type TrendBucket } from './analytics.repository.js'
import {
  AnalyticsCredentialsRepository,
  type CredentialCampaign,
  type CredentialCombo,
  type CredentialSuccessBucket,
} from './analytics-credentials.repository.js'
import { withCache } from '../../lib/cache-helper.js'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'

export const ANALYTICS_RANGE_CONFIG = {
  '7d':  { days: 7,   granularity: 'hour' as const },
  '30d': { days: 30,  granularity: 'day'  as const },
  '90d': { days: 90,  granularity: 'day'  as const },
  '1y':  { days: 365, granularity: 'week' as const },
}

export type TrendRange = keyof typeof ANALYTICS_RANGE_CONFIG

// This is historical/aggregate data, not the live dashboard — a few minutes
// of staleness is fine and keeps repeat range/protocol toggling instant.
const TRENDS_TTL_SECONDS = 300
const CREDENTIALS_TTL_SECONDS = 600
export const CAMPAIGN_WINDOW_MINUTES = 5
export const CAMPAIGN_MINIMUM_ATTEMPTS = 10

export class AnalyticsService {
  private repo: AnalyticsRepository | null
  private credentialsRepo: AnalyticsCredentialsRepository | null

  constructor(ch: ClickHouseClient | null) {
    this.repo = ch ? new AnalyticsRepository(ch) : null
    this.credentialsRepo = ch ? new AnalyticsCredentialsRepository(ch) : null
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

    const { days, granularity } = ANALYTICS_RANGE_CONFIG[range]
    const key = `analytics:trends:${range}:${protocol ?? 'all'}:${scope.cacheSuffix}`
    return withCache(cache, key, TRENDS_TTL_SECONDS, () =>
      repo.getTrends(days, granularity, protocol, scope),
    )
  }

  async getCredentialTopCombos(
    cache: FastifyInstance['cache'],
    range: TrendRange,
    limit: number,
    scope: ClickHouseScope,
  ): Promise<CredentialCombo[]> {
    const repo = this.credentialsRepo
    if (!repo) throw new Error('analytics_unavailable')

    const { days } = ANALYTICS_RANGE_CONFIG[range]
    const key = `analytics:credentials:top-combos:${range}:${limit}:${scope.cacheSuffix}`
    return withCache(cache, key, CREDENTIALS_TTL_SECONDS, () =>
      repo.getTopCombos(days, limit, scope),
    )
  }

  async getCredentialCampaigns(
    cache: FastifyInstance['cache'],
    range: TrendRange,
    limit: number,
    scope: ClickHouseScope,
  ): Promise<CredentialCampaign[]> {
    const repo = this.credentialsRepo
    if (!repo) throw new Error('analytics_unavailable')

    const { days } = ANALYTICS_RANGE_CONFIG[range]
    const key = `analytics:credentials:campaigns:${range}:${limit}:${scope.cacheSuffix}`
    return withCache(cache, key, CREDENTIALS_TTL_SECONDS, () =>
      repo.getCampaigns(days, CAMPAIGN_MINIMUM_ATTEMPTS, limit, scope),
    )
  }

  async getCredentialSuccessRate(
    cache: FastifyInstance['cache'],
    range: TrendRange,
    scope: ClickHouseScope,
  ): Promise<CredentialSuccessBucket[]> {
    const repo = this.credentialsRepo
    if (!repo) throw new Error('analytics_unavailable')

    const { days, granularity } = ANALYTICS_RANGE_CONFIG[range]
    const key = `analytics:credentials:success-rate:${range}:${scope.cacheSuffix}`
    return withCache(cache, key, CREDENTIALS_TTL_SECONDS, () =>
      repo.getSuccessRate(days, granularity, scope),
    )
  }

  async getReportSummary(
    cache: FastifyInstance['cache'],
    range: TrendRange,
    credentialLimit: number,
    scope: ClickHouseScope,
  ) {
    const [trends, topCredentials, credentialSuccessRate] = await Promise.all([
      this.getTrends(cache, range, null, scope),
      this.getCredentialTopCombos(cache, range, credentialLimit, scope),
      this.getCredentialSuccessRate(cache, range, scope),
    ])
    return {
      trends,
      credentials: {
        top: topCredentials,
        successRate: credentialSuccessRate,
      },
    }
  }
}
