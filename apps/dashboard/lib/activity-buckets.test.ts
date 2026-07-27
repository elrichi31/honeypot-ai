import assert from "node:assert/strict"
import { test } from "node:test"
import { buildActivityBuckets } from "./activity-buckets.ts"

test("returns empty for no timestamps", () => {
  assert.deepEqual(buildActivityBuckets([]), [])
})

test("bins all timestamps and preserves total count", () => {
  const base = new Date("2026-01-01T00:00:00Z").getTime()
  const ts = Array.from({ length: 10 }, (_, i) => new Date(base + i * 3_600_000).toISOString())
  const buckets = buildActivityBuckets(ts, 5)
  assert.equal(buckets.length, 5)
  assert.equal(buckets.reduce((a, b) => a + b.count, 0), 10)
})

test("a single timestamp lands in one bucket", () => {
  const buckets = buildActivityBuckets([new Date("2026-01-01T12:00:00Z").toISOString()], 4)
  assert.equal(buckets.reduce((a, b) => a + b.count, 0), 1)
})
