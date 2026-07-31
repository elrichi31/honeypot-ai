import type { AnalyticsRange, AnalyticsReportSummary } from "@/lib/api/analytics"
import type { ReportHistory } from "../types"

// The lake stores the source name, not the protocol a reader recognizes:
// cowrie IS ssh, and a client reading "COWRIE" next to "SSH" sees two things.
function protocolLabel(protocol: string): string {
  return protocol === "cowrie" ? "SSH" : protocol.toUpperCase()
}

export function summarizeHistory(
  range: AnalyticsRange,
  raw: AnalyticsReportSummary,
): ReportHistory {
  const byProtocol = new Map<string, number>()
  let firstBucket: string | null = null
  let lastBucket: string | null = null

  for (const row of raw.trends) {
    const label = protocolLabel(row.protocol)
    byProtocol.set(label, (byProtocol.get(label) ?? 0) + row.count)
    if (firstBucket === null || row.bucket < firstBucket) firstBucket = row.bucket
    if (lastBucket === null || row.bucket > lastBucket) lastBucket = row.bucket
  }

  const totalAttempts = raw.credentials.successRate.reduce((sum, row) => sum + row.total, 0)
  const successes = raw.credentials.successRate.reduce((sum, row) => sum + row.successCount, 0)

  return {
    range,
    firstBucket,
    lastBucket,
    totalEvents: Array.from(byProtocol.values()).reduce((sum, count) => sum + count, 0),
    byProtocol: Array.from(byProtocol.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    totalAttempts,
    successRatePct: totalAttempts > 0 ? (successes / totalAttempts) * 100 : 0,
    topCredentials: raw.credentials.top,
  }
}
