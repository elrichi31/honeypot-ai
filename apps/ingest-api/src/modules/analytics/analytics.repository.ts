import type { ClickHouseClient } from '@clickhouse/client'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'
import { ALL_ANALYTICS_EVENTS_SUBQUERY } from './analytics-all-events.repository.js'

// ANALYTICS_MODULE Fase A (docs/plans/ANALYTICS_MODULE.md) — all ClickHouse
// SQL lives here, same rule as Prisma/$queryRaw elsewhere
// (docs/project-notes/backend-layering.md), applied to the second DB.

export type TrendBucket = { bucket: string; protocol: string; count: number }

type Granularity = 'hour' | 'day' | 'week'

const BUCKET_FN: Record<Granularity, string> = {
  hour: 'toStartOfHour',
  day: 'toStartOfDay',
  week: 'toStartOfWeek',
}

export class AnalyticsRepository {
  constructor(private ch: ClickHouseClient) {}

  async getTrends(
    rangeDays: number,
    granularity: Granularity,
    protocol: string | null,
    scope: ClickHouseScope,
  ): Promise<TrendBucket[]> {
    const bucketFn = BUCKET_FN[granularity]
    const protocolFilter = protocol ? 'AND source = {protocol:String}' : ''

    const result = await this.ch.query({
      query: `
        SELECT
          toString(${bucketFn}(timestamp)) AS bucket,
          source AS protocol,
          count() AS count
        FROM
        (
          ${ALL_ANALYTICS_EVENTS_SUBQUERY}
        )
        WHERE timestamp >= now() - INTERVAL {rangeDays:UInt16} DAY
          ${scope.condition}
          ${protocolFilter}
        GROUP BY bucket, protocol
        ORDER BY bucket ASC
      `,
      query_params: {
        rangeDays,
        ...scope.params,
        ...(protocol ? { protocol } : {}),
      },
      format: 'JSONEachRow',
    })

    return result.json<TrendBucket>()
  }
}
