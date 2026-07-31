import type { ClickHouseClient } from '@clickhouse/client'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'

export type CredentialGranularity = 'hour' | 'day' | 'week'

export type CredentialCombo = {
  username: string | null
  password: string | null
  count: number
  uniqueIps: number
  firstSeen: string
  lastSeen: string
}

export type CredentialCampaign = {
  bucket: string
  srcIp: string
  attempts: number
  successCount: number
  failedCount: number
  unknownCount: number
  protocols: string[]
}

export type CredentialSuccessBucket = {
  bucket: string
  successCount: number
  failedCount: number
  total: number
  successRate: number
}

const BUCKET_FN: Record<CredentialGranularity, string> = {
  hour: 'toStartOfHour',
  day: 'toStartOfDay',
  week: 'toStartOfWeek',
}

const CREDENTIAL_EVENTS = `
  SELECT
    timestamp,
    src_ip,
    username,
    password,
    sensor_id,
    'ssh' AS protocol,
    CAST(eventid = 'cowrie.login.success', 'Nullable(UInt8)') AS result
  FROM cowrie_events FINAL
  WHERE eventid IN ('cowrie.login.success', 'cowrie.login.failed')

  UNION ALL

  SELECT
    timestamp,
    src_ip,
    username,
    password,
    sensor_id,
    protocol,
    CAST(NULL, 'Nullable(UInt8)') AS result
  FROM protocol_events FINAL
  WHERE event_type = 'auth'
`

export class AnalyticsCredentialsRepository {
  constructor(private ch: ClickHouseClient) {}

  async getTopCombos(
    rangeDays: number,
    limit: number,
    scope: ClickHouseScope,
  ): Promise<CredentialCombo[]> {
    const result = await this.ch.query({
      query: `
        SELECT
          username,
          password,
          count() AS count,
          uniqExact(src_ip) AS uniqueIps,
          toString(min(timestamp)) AS firstSeen,
          toString(max(timestamp)) AS lastSeen
        FROM (${CREDENTIAL_EVENTS})
        WHERE timestamp >= now() - INTERVAL {rangeDays:UInt16} DAY
          AND (username IS NOT NULL OR password IS NOT NULL)
          ${scope.condition}
        GROUP BY username, password
        ORDER BY count DESC, lastSeen DESC
        LIMIT {limit:UInt16}
      `,
      query_params: { rangeDays, limit, ...scope.params },
      format: 'JSONEachRow',
    })

    return result.json<CredentialCombo>()
  }

  async getCampaigns(
    rangeDays: number,
    minimumAttempts: number,
    limit: number,
    scope: ClickHouseScope,
  ): Promise<CredentialCampaign[]> {
    const result = await this.ch.query({
      query: `
        SELECT
          toString(toStartOfInterval(timestamp, INTERVAL 5 MINUTE)) AS bucket,
          src_ip AS srcIp,
          count() AS attempts,
          countIf(result = 1) AS successCount,
          countIf(result = 0) AS failedCount,
          countIf(result IS NULL) AS unknownCount,
          arraySort(groupUniqArray(protocol)) AS protocols
        FROM (${CREDENTIAL_EVENTS})
        WHERE timestamp >= now() - INTERVAL {rangeDays:UInt16} DAY
          ${scope.condition}
        GROUP BY bucket, srcIp
        HAVING attempts >= {minimumAttempts:UInt16}
        ORDER BY bucket DESC, attempts DESC
        LIMIT {limit:UInt16}
      `,
      query_params: { rangeDays, minimumAttempts, limit, ...scope.params },
      format: 'JSONEachRow',
    })

    return result.json<CredentialCampaign>()
  }

  async getSuccessRate(
    rangeDays: number,
    granularity: CredentialGranularity,
    scope: ClickHouseScope,
  ): Promise<CredentialSuccessBucket[]> {
    const bucketFn = BUCKET_FN[granularity]
    const result = await this.ch.query({
      query: `
        SELECT
          toString(${bucketFn}(timestamp)) AS bucket,
          countIf(eventid = 'cowrie.login.success') AS successCount,
          countIf(eventid = 'cowrie.login.failed') AS failedCount,
          count() AS total,
          if(total = 0, 0, successCount / total) AS successRate
        FROM cowrie_events FINAL
        WHERE timestamp >= now() - INTERVAL {rangeDays:UInt16} DAY
          AND eventid IN ('cowrie.login.success', 'cowrie.login.failed')
          ${scope.condition}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      query_params: { rangeDays, ...scope.params },
      format: 'JSONEachRow',
    })

    return result.json<CredentialSuccessBucket>()
  }
}
