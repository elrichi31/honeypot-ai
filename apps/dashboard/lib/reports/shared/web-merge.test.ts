/**
 * Run from apps/dashboard:  npx tsx --test lib/reports/shared/web-merge.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { mergeWebProfiles } from "./web-merge.ts"
import type { ReportSensorProfile, ReportWebProfile } from "../types.ts"

const web = (over: Partial<ReportWebProfile>): ReportWebProfile => ({
  hits: 0, uniquePaths: 0, attackTypeCount: 0, sessionCount: 0,
  fingerprintedSessions: 0, multiIpSessions: 0, canaryHits: 0, chainHits: 0,
  topAttackTypes: [], topPaths: [], topMethods: [], topUserAgents: [],
  topCanaryTokens: [], topSessions: [], ...over,
})

const sensor = (w?: ReportWebProfile) => ({ web: w }) as unknown as ReportSensorProfile

test("a client with no HTTP decoy gets no web section at all", () => {
  assert.equal(mergeWebProfiles([sensor(), sensor()]), null)
})

test("counts are summed and same-label attack types are combined, not double-counted", () => {
  const merged = mergeWebProfiles([
    sensor(web({ hits: 100, sessionCount: 10, canaryHits: 3, topAttackTypes: [{ label: "sqli", count: 60 }, { label: "xss", count: 10 }] })),
    sensor(web({ hits: 50, sessionCount: 5, canaryHits: 1, topAttackTypes: [{ label: "sqli", count: 20 }] })),
  ])!
  assert.equal(merged.hits, 150)
  assert.equal(merged.sessionCount, 15)
  assert.equal(merged.canaryHits, 4)
  assert.deepEqual(merged.topAttackTypes, [{ label: "sqli", count: 80 }, { label: "xss", count: 10 }])
  // Two decoys seeing sqli is one attack type, not two.
  assert.equal(merged.attackTypeCount, 2)
})

test("a single decoy is passed through untouched", () => {
  const only = web({ hits: 7, attackTypeCount: 99 })
  assert.equal(mergeWebProfiles([sensor(only), sensor()]), only)
})

test("dominant sessions are ranked across decoys, not concatenated per decoy", () => {
  const s = (label: string, hits: number) => ({ label, hits, ipCount: 1, chainHits: 0, canaryHits: 0, attackTypes: [], topPaths: [] })
  const merged = mergeWebProfiles([
    sensor(web({ hits: 1, topSessions: [s("quiet", 2)] })),
    sensor(web({ hits: 1, topSessions: [s("loud", 90)] })),
  ])!
  assert.deepEqual(merged.topSessions.map((x) => x.label), ["loud", "quiet"])
})
