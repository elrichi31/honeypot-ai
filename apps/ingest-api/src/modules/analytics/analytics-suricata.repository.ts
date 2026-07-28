import type { ClickHouseClient } from '@clickhouse/client'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'

export type SuricataTrendGroup = 'signature' | 'category'
export type SuricataTrendGranularity = 'hour' | 'day' | 'week'

export type SuricataTrendRow = {
  bucket: string
  name: string
  count: number
  severity: number
}

const BUCKET_FN: Record<SuricataTrendGranularity, string> = {
  hour: 'toStartOfHour',
  day: 'toStartOfDay',
  week: 'toStartOfWeek',
}

const GROUP_COLUMN: Record<SuricataTrendGroup, string> = {
  signature: 'signature',
  category: 'category',
}

export class AnalyticsSuricataRepository {
  constructor(private ch: ClickHouseClient) {}

  async getTrends(
    rangeDays: number,
    granularity: SuricataTrendGranularity,
    groupBy: SuricataTrendGroup,
    limit: number,
    scope: ClickHouseScope,
  ): Promise<SuricataTrendRow[]> {
    const bucketFn = BUCKET_FN[granularity]
    const groupColumn = GROUP_COLUMN[groupBy]
    const result = await this.ch.query({
      query: `
        WITH top_groups AS
        (
          SELECT ${groupColumn} AS groupName
          FROM suricata_alerts
          WHERE timestamp >= now() - INTERVAL {rangeDays:UInt16} DAY
            ${scope.condition}
          GROUP BY groupName
          ORDER BY count() DESC
          LIMIT {limit:UInt8}
        )
        SELECT
          toString(${bucketFn}(timestamp)) AS bucket,
          ${groupColumn} AS name,
          count() AS count,
          min(severity) AS severity
        FROM suricata_alerts
        WHERE timestamp >= now() - INTERVAL {rangeDays:UInt16} DAY
          ${scope.condition}
          AND ${groupColumn} IN (SELECT groupName FROM top_groups)
        GROUP BY bucket, name
        ORDER BY bucket ASC, count DESC
      `,
      query_params: { rangeDays, limit, ...scope.params },
      format: 'JSONEachRow',
    })

    return result.json<SuricataTrendRow>()
  }
}
