import type { ClickHouseClient } from '@clickhouse/client'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'
import { ALL_ANALYTICS_EVENTS_SUBQUERY } from './analytics-all-events.repository.js'

export type TopAttackerRow = {
  srcIp: string
  count: number
  firstSeen: string
  lastSeen: string
  sources: string[]
}

export class AnalyticsRankingRepository {
  constructor(private ch: ClickHouseClient) {}

  async getTopAttackers(
    rangeDays: number,
    limit: number,
    scope: ClickHouseScope,
  ): Promise<TopAttackerRow[]> {
    const result = await this.ch.query({
      query: `
        SELECT
          srcIp,
          count() AS count,
          toString(min(timestamp)) AS firstSeen,
          toString(max(timestamp)) AS lastSeen,
          arraySort(groupUniqArray(source)) AS sources
        FROM
        (
          ${ALL_ANALYTICS_EVENTS_SUBQUERY}
        )
        WHERE timestamp >= now() - INTERVAL {rangeDays:UInt16} DAY
          AND notEmpty(srcIp)
          ${scope.condition}
        GROUP BY srcIp
        ORDER BY count DESC, srcIp ASC
        LIMIT {limit:UInt16}
      `,
      query_params: {
        rangeDays,
        limit,
        ...scope.params,
      },
      format: 'JSONEachRow',
    })
    return result.json<TopAttackerRow>()
  }
}
