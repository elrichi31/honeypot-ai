import type { ClickHouseClient } from '@clickhouse/client'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'

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

  // Volume over time across all 4 lake sources. Inlined UNION ALL rather than
  // a ClickHouse-side VIEW (the plan sketches one as `all_events`) — this is
  // the only call site so far; promote it to a VIEW if a second query needs
  // the same union (YAGNI otherwise, and one less thing to migrate today).
  async getTrends(
    rangeDays: number,
    granularity: Granularity,
    protocol: string | null,
    scope: ClickHouseScope,
  ): Promise<TrendBucket[]> {
    const bucketFn = BUCKET_FN[granularity]
    const protocolFilter = protocol ? 'AND protocol = {protocol:String}' : ''

    const result = await this.ch.query({
      query: `
        SELECT
          toString(${bucketFn}(timestamp)) AS bucket,
          protocol,
          count() AS count
        FROM
        (
          SELECT timestamp, 'cowrie' AS protocol, sensor_id FROM cowrie_events
          UNION ALL
          SELECT timestamp, 'web' AS protocol, sensor_id FROM web_events
          UNION ALL
          SELECT timestamp, protocol, sensor_id FROM protocol_events
          UNION ALL
          SELECT timestamp, 'suricata' AS protocol, sensor_id FROM suricata_alerts
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
