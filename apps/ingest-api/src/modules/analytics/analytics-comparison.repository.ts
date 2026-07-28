import type { ClickHouseClient } from '@clickhouse/client'
import type { PrismaClient } from '@prisma/client'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'

export type ComparisonGranularity = 'hour' | 'day' | 'week'

export type SensorComparisonRow = {
  bucket: string
  sensorId: string
  count: number
}

export type SensorDirectoryRow = {
  sensorId: string
  sensorName: string
  clientId: string | null
  clientName: string | null
}

const BUCKET_FN: Record<ComparisonGranularity, string> = {
  hour: 'toStartOfHour',
  day: 'toStartOfDay',
  week: 'toStartOfWeek',
}

export class AnalyticsComparisonRepository {
  constructor(private ch: ClickHouseClient) {}

  async getSensorTrends(
    rangeDays: number,
    granularity: ComparisonGranularity,
    scope: ClickHouseScope,
  ): Promise<SensorComparisonRow[]> {
    const bucketFn = BUCKET_FN[granularity]
    const result = await this.ch.query({
      query: `
        SELECT
          toString(${bucketFn}(timestamp)) AS bucket,
          sensor_id AS sensorId,
          count() AS count
        FROM
        (
          SELECT timestamp, sensor_id FROM cowrie_events
          UNION ALL
          SELECT timestamp, sensor_id FROM web_events
          UNION ALL
          SELECT timestamp, sensor_id FROM protocol_events
          UNION ALL
          SELECT timestamp, sensor_id FROM suricata_alerts
        )
        WHERE timestamp >= now() - INTERVAL {rangeDays:UInt16} DAY
          ${scope.condition}
        GROUP BY bucket, sensorId
        ORDER BY bucket ASC, count DESC
      `,
      query_params: { rangeDays, ...scope.params },
      format: 'JSONEachRow',
    })
    return result.json<SensorComparisonRow>()
  }
}

export class AnalyticsSensorDirectoryRepository {
  constructor(private prismaRead: PrismaClient) {}

  async list(): Promise<SensorDirectoryRow[]> {
    return this.prismaRead.$queryRaw<SensorDirectoryRow[]>`
      SELECT
        s.sensor_id AS "sensorId",
        s.name AS "sensorName",
        c.id AS "clientId",
        c.name AS "clientName"
      FROM sensors s
      LEFT JOIN clients c ON c.id = s.client_id
    `
  }
}
