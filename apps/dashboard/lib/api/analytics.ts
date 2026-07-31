import { apiFetch, getApiUrl } from "./client"
import { sensorScopeParam } from "./stats"

export type AnalyticsRange = "7d" | "30d" | "90d" | "1y"

export interface AnalyticsTrendBucket {
  bucket: string
  protocol: string
  count: number
}

export interface AnalyticsCredentialCombo {
  username: string | null
  password: string | null
  count: number
}

export interface AnalyticsSuccessBucket {
  bucket: string
  successCount: number
  failedCount: number
  total: number
}

export interface AnalyticsReportSummary {
  trends: AnalyticsTrendBucket[]
  credentials: {
    top: AnalyticsCredentialCombo[]
    successRate: AnalyticsSuccessBucket[]
  }
}

// ClickHouse serializes UInt64 as JSON strings, so every count arrives as
// `"1234"` and `a + b` silently concatenates. Normalize once here instead of
// sprinkling Number() over every consumer.
export async function fetchAnalyticsReportSummary(params: {
  range: AnalyticsRange
  credentialLimit?: number
  sensorIds?: string[]
}): Promise<AnalyticsReportSummary> {
  const { range, credentialLimit = 10, sensorIds } = params
  const raw = await apiFetch<AnalyticsReportSummary>(
    `${getApiUrl()}/analytics/report-summary?range=${range}&credentialLimit=${credentialLimit}${sensorScopeParam(sensorIds)}`,
    300,
    30000,
  )
  return {
    trends: raw.trends.map((row) => ({ ...row, count: Number(row.count) })),
    credentials: {
      top: raw.credentials.top.map((row) => ({ ...row, count: Number(row.count) })),
      successRate: raw.credentials.successRate.map((row) => ({
        ...row,
        successCount: Number(row.successCount),
        failedCount: Number(row.failedCount),
        total: Number(row.total),
      })),
    },
  }
}
