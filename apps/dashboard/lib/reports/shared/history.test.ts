/**
 * Run from apps/dashboard:  npx tsx --test lib/reports/shared/history.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { summarizeHistory } from "./history.ts"
import type { AnalyticsReportSummary } from "@/lib/api/analytics"

const summary: AnalyticsReportSummary = {
  trends: [
    { bucket: "2026-01-01", protocol: "cowrie", count: 10 },
    { bucket: "2026-01-02", protocol: "cowrie", count: 5 },
    { bucket: "2026-01-01", protocol: "web", count: 40 },
  ],
  credentials: {
    top: [{ username: "root", password: "123456", count: 99 }],
    successRate: [
      { bucket: "2026-01-01", successCount: 1, failedCount: 9, total: 10 },
      { bucket: "2026-01-02", successCount: 2, failedCount: 8, total: 10 },
    ],
  },
}

test("aggregates per protocol and ranks by volume", () => {
  const h = summarizeHistory("1y", summary)
  assert.equal(h.totalEvents, 55)
  assert.deepEqual(h.byProtocol, [
    { label: "web", count: 40 },
    { label: "cowrie", count: 15 },
  ])
})

test("success rate is successes over total attempts", () => {
  const h = summarizeHistory("1y", summary)
  assert.equal(h.totalAttempts, 20)
  assert.equal(h.successRatePct, 15)
})

test("empty lake yields zeros, not NaN", () => {
  const h = summarizeHistory("1y", { trends: [], credentials: { top: [], successRate: [] } })
  assert.equal(h.totalEvents, 0)
  assert.equal(h.successRatePct, 0)
  assert.deepEqual(h.byProtocol, [])
})
