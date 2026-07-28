import type { ClickHouseClient } from '@clickhouse/client'
import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'
import { withCache } from '../../lib/cache-helper.js'
import {
  ANALYTICS_RANGE_CONFIG,
  type TrendRange,
} from './analytics.service.js'
import {
  AnalyticsComparisonRepository,
  AnalyticsSensorDirectoryRepository,
  type SensorDirectoryRow,
} from './analytics-comparison.repository.js'

export type SensorComparisonPoint = {
  bucket: string
  sensorId: string
  sensorName: string
  clientId: string | null
  clientName: string | null
  count: number
}

export type ClientComparisonPoint = {
  bucket: string
  clientId: string | null
  clientName: string
  count: number
}

export type AnalyticsComparison = {
  bySensor: SensorComparisonPoint[]
  byClient: ClientComparisonPoint[]
}

const COMPARISON_TTL_SECONDS = 600
const UNASSIGNED_CLIENT_NAME = 'Unassigned'

export class AnalyticsComparisonService {
  private repo: AnalyticsComparisonRepository | null
  private directory: AnalyticsSensorDirectoryRepository

  constructor(ch: ClickHouseClient | null, prismaRead: PrismaClient) {
    this.repo = ch ? new AnalyticsComparisonRepository(ch) : null
    this.directory = new AnalyticsSensorDirectoryRepository(prismaRead)
  }

  get enabled(): boolean {
    return this.repo !== null
  }

  async getComparison(
    cache: FastifyInstance['cache'],
    range: TrendRange,
    scope: ClickHouseScope,
  ): Promise<AnalyticsComparison> {
    const repo = this.repo
    if (!repo) throw new Error('analytics_unavailable')

    const { days, granularity } = ANALYTICS_RANGE_CONFIG[range]
    const cacheKey = `analytics:comparison:${range}:${scope.cacheSuffix}`
    return withCache(cache, cacheKey, COMPARISON_TTL_SECONDS, async () => {
      const [rows, directoryRows] = await Promise.all([
        repo.getSensorTrends(days, granularity, scope),
        this.directory.list(),
      ])
      return buildComparison(rows, directoryRows)
    })
  }
}

function buildComparison(
  rows: Array<{ bucket: string; sensorId: string; count: number }>,
  directoryRows: SensorDirectoryRow[],
): AnalyticsComparison {
  const directory = new Map(directoryRows.map((row) => [row.sensorId, row]))
  const bySensor = rows.map((row) => {
    const sensor = directory.get(row.sensorId)
    return {
      bucket: row.bucket,
      sensorId: row.sensorId,
      sensorName: sensor?.sensorName ?? row.sensorId,
      clientId: sensor?.clientId ?? null,
      clientName: sensor?.clientName ?? null,
      count: Number(row.count),
    }
  })

  const clientTotals = new Map<string, ClientComparisonPoint>()
  for (const row of bySensor) {
    const key = JSON.stringify([row.bucket, row.clientId])
    const current = clientTotals.get(key)
    clientTotals.set(key, {
      bucket: row.bucket,
      clientId: row.clientId,
      clientName: row.clientName ?? UNASSIGNED_CLIENT_NAME,
      count: (current?.count ?? 0) + row.count,
    })
  }

  const byClient = [...clientTotals.values()].sort((a, b) =>
    a.bucket.localeCompare(b.bucket) || b.count - a.count || a.clientName.localeCompare(b.clientName),
  )
  return { bySensor, byClient }
}
