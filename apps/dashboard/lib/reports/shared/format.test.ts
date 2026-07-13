/**
 * Run from apps/dashboard:  npx tsx --test lib/reports/shared/format.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { resolvePresetWindow, timelineGranularity } from "./format.ts"

// Fixed "now": 2026-03-15 12:00 local.
const NOW = new Date(2026, 2, 15, 12, 0, 0)

test("last7 / last30 span back from now", () => {
  const w7 = resolvePresetWindow("last7", {}, NOW)!
  assert.equal(w7.endDate, NOW.toISOString())
  assert.equal(new Date(w7.startDate).getDate(), 8) // Mar 15 - 7 = Mar 8

  const w30 = resolvePresetWindow("last30", {}, NOW)!
  const spanDays = (new Date(w30.endDate).getTime() - new Date(w30.startDate).getTime()) / 86_400_000
  assert.equal(Math.round(spanDays), 30)
})

test("thisMonth starts on the 1st, ends now", () => {
  const w = resolvePresetWindow("thisMonth", {}, NOW)!
  assert.equal(new Date(w.startDate).getDate(), 1)
  assert.equal(new Date(w.startDate).getMonth(), 2) // March
  assert.equal(w.endDate, NOW.toISOString())
})

test("lastMonth is the full previous month", () => {
  const w = resolvePresetWindow("lastMonth", {}, NOW)!
  const start = new Date(w.startDate)
  const end = new Date(w.endDate)
  assert.equal(start.getMonth(), 1) // February
  assert.equal(start.getDate(), 1)
  assert.equal(end.getMonth(), 2) // first of March (exclusive upper bound)
  assert.equal(end.getDate(), 1)
})

test("lastMonth wraps year boundary (January now → December)", () => {
  const jan = new Date(2026, 0, 10, 12, 0, 0)
  const w = resolvePresetWindow("lastMonth", {}, jan)!
  const start = new Date(w.startDate)
  assert.equal(start.getFullYear(), 2025)
  assert.equal(start.getMonth(), 11) // December
})

test("custom requires both dates and start < end", () => {
  assert.equal(resolvePresetWindow("custom", {}, NOW), null)
  assert.equal(resolvePresetWindow("custom", { start: "2026-03-10" }, NOW), null)
  assert.equal(resolvePresetWindow("custom", { start: "2026-03-10", end: "2026-03-05" }, NOW), null)

  const w = resolvePresetWindow("custom", { start: "2026-03-01", end: "2026-03-03" }, NOW)!
  assert.equal(new Date(w.startDate).getDate(), 1)
  // end extends through the end of the day
  assert.ok(new Date(w.endDate).getTime() > new Date("2026-03-03T00:00:00").getTime())
})

test("timelineGranularity maps span to bucket size", () => {
  const iso = (d: string) => new Date(d).toISOString()
  assert.equal(timelineGranularity(iso("2026-03-14"), iso("2026-03-15")), "day")
  assert.equal(timelineGranularity(iso("2026-03-08"), iso("2026-03-15")), "week")
  assert.equal(timelineGranularity(iso("2026-02-01"), iso("2026-03-15")), "month")
})
