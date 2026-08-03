/**
 * Run from apps/dashboard:  npx tsx --test lib/reports/shared/threat-intel-view.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { actorTableRows, activityLine, iocTables, originLine, reputationLine } from "./threat-intel-view.ts"
import { threatPeriod } from "./format.ts"
import type { ReportActorIntel, ReportThreatIntel } from "../types.ts"

const actor = {
  ip: "45.9.148.99",
  score: 92,
  level: "CRITICAL",
  protocols: ["SSH", "HTTP"],
  crossProtocol: true,
  topFactors: ["shell obtained", "malware download"],
  sshSessions: 14,
  loginSuccess: true,
  commandCount: 61,
  webHits: 0,
  protocolHits: 30,
  ports: [21, 445],
  country: "Netherlands",
  org: "AS49505 Selectel",
  usageType: "Data Center/Web Hosting/Transit",
  hosting: true,
  abuseScore: 100,
  abuseReports: 412,
  lastReportedAt: "2026-08-01T10:00:00Z",
  vtMalicious: 12,
  vtEngineCount: 94,
  vtFlaggedBy: ["CRDF", "Fortinet"],
  analysis: null,
} satisfies ReportActorIntel

const t = ((key: string) => key) as never

test("the actor row carries evidence, not just the IP", () => {
  const [row] = actorTableRows([actor])
  assert.deepEqual(row.slice(0, 3), ["45.9.148.99", "92 CRITICAL", "SSH, HTTP"])
  assert.match(row[3], /14 SSH/)
  assert.match(row[3], /shell/)
  assert.match(row[4], /Netherlands/)
  assert.match(row[5], /Abuse 100%/)
  assert.match(row[5], /VT 12\/94/)
})

test("missing enrichment degrades to '-' instead of 'null'", () => {
  const bare = { ...actor, country: null, org: null, usageType: null, hosting: false, abuseScore: null, vtMalicious: null }
  assert.equal(originLine(bare), "-")
  assert.equal(reputationLine(bare), "-")
})

test("an actor with no activity at all still renders", () => {
  const quiet = { ...actor, sshSessions: 0, commandCount: 0, webHits: 0, protocolHits: 0, loginSuccess: false }
  assert.equal(activityLine(quiet), "-")
})

test("empty IoC families are dropped, not rendered as empty tables", () => {
  const iocs: ReportThreatIntel["iocs"] = {
    c2: [{ value: "http://1.2.3.4/x.sh", type: "url", host: "1.2.3.4", srcIp: "45.9.148.99", firstSeen: "2026-08-01T10:00:00Z" }],
    sshKeys: [],
    credentials: [],
    hassh: [],
  }
  const tables = iocTables(iocs, t)
  assert.equal(tables.length, 1)
  assert.deepEqual(tables[0].rows[0], ["http://1.2.3.4/x.sh", "45.9.148.99", "2026-08-01 10:00"])
})

test("the threats window covers the report period rather than truncating it", () => {
  assert.equal(threatPeriod("2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z"), "24h")
  assert.equal(threatPeriod("2026-07-27T00:00:00Z", "2026-08-03T00:00:00Z"), "7d")
  assert.equal(threatPeriod("2026-07-04T00:00:00Z", "2026-08-03T00:00:00Z"), "30d")
  assert.equal(threatPeriod("2026-05-03T00:00:00Z", "2026-08-03T00:00:00Z"), "90d")
})
