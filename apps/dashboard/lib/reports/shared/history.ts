import type { AnalyticsRange, AnalyticsReportSummary } from "@/lib/api/analytics"
import type { ReportHistory } from "../types"

export function summarizeHistory(
  range: AnalyticsRange,
  raw: AnalyticsReportSummary,
): ReportHistory {
  const byProtocol = new Map<string, number>()
  for (const row of raw.trends) {
    byProtocol.set(row.protocol, (byProtocol.get(row.protocol) ?? 0) + row.count)
  }

  const totalAttempts = raw.credentials.successRate.reduce((sum, row) => sum + row.total, 0)
  const successes = raw.credentials.successRate.reduce((sum, row) => sum + row.successCount, 0)

  return {
    range,
    totalEvents: Array.from(byProtocol.values()).reduce((sum, count) => sum + count, 0),
    byProtocol: Array.from(byProtocol.entries())
      .map(([protocol, count]) => ({ label: protocol, count }))
      .sort((a, b) => b.count - a.count),
    totalAttempts,
    successRatePct: totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0,
    topCredentials: raw.credentials.top,
  }
}
