/**
 * Run from apps/dashboard:  npx tsx --test lib/reports/narrative.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildNarrativeDigest, pickSections } from "./narrative.ts"
import type { ClientReportData } from "./types.ts"

// Only the fields the digest reads — a full ClientReportData fixture would be
// pages of noise with nothing extra asserted.
const data = {
  meta: { clientName: "ACME", periodLabel: "July 1 - July 8, 2026", timezone: "UTC" },
  overview: {
    ssh: { sessions: 120, uniqueIps: 30, successfulLogins: 7 },
    web: { hits: 400, uniqueIps: 50 },
    protocols: [{ protocol: "smb", count: 88, uniqueIps: 9 }],
  },
  kpiTrends: {
    events: { current: 608, deltaPct: 25 },
    sshSessions: { current: 120, deltaPct: null },
    webHits: { current: 400, deltaPct: -10 },
    uniqueIps: { current: 80, deltaPct: 5 },
  },
  mitre: { tactics: [{ tactic: "Reconnaissance", techniques: [{ name: "Active Scanning", count: 42 }] }] },
  botRatio: { bot: 100, human: 2, unknown: 18 },
  insights: { funnel: { connections: 120, authAttempts: 90, loginSuccess: 7, commands: 12, highSignalCompromise: 3 } },
  geo: [{ country: "Brazil", count: 300, share: 49.3 }],
  topCredentials: [{ username: "root", password: "123456", attempts: 50, successCount: 1 }],
  credentialSummary: {
    totalAttempts: 90, successfulAttempts: 7, uniqueUsernames: 12,
    uniquePasswords: 60, sprayPasswords: 4, targetedUsernames: 2,
  },
  sensors: [
    {
      sensor: { sensorId: "s-ssh-1", name: "edge-ssh", protocol: "ssh", online: true, eventsTotal: 120 },
      eventShare: 60, uniqueIps: 30, authAttempts: 90, successCount: 7, malwareCount: 2,
    },
    {
      sensor: { sensorId: "s-web-1", name: "portal-web", protocol: "http", online: false, eventsTotal: 400 },
      eventShare: 40, uniqueIps: 50, authAttempts: 0, successCount: 0, malwareCount: 0,
      web: {
        hits: 400, uniquePaths: 88, sessionCount: 40, fingerprintedSessions: 31,
        multiIpSessions: 4, canaryHits: 12, chainHits: 26,
        topAttackTypes: [{ label: "sqli", count: 90 }, { label: "path-traversal", count: 40 }],
      },
    },
  ],
  history: {
    firstBucket: "2026-01-01", lastBucket: "2026-07-08", totalEvents: 9000,
    totalAttempts: 800, successRatePct: 99.9, byProtocol: [{ label: "SSH", count: 9000 }],
  },
} as unknown as ClientReportData

test("digest carries the figures the model must not invent", () => {
  const d = buildNarrativeDigest(data)
  assert.match(d, /ACME/)
  assert.match(d, /July 1 - July 8, 2026/)
  assert.match(d, /Total events: 608/)
  assert.match(d, /root \/ 123456 — 50 attempts, 1 accepted/)
  assert.match(d, /Reconnaissance: 42 hits/)
  assert.match(d, /Brazil: 300 events/)
})

test("a null delta reads as 'no prior data', never as 0%", () => {
  const d = buildNarrativeDigest(data)
  assert.match(d, /SSH sessions: 120 \(no prior data\)/)
  assert.match(d, /Total events: 608 \(\+25% vs previous period\)/)
  assert.match(d, /Web hits: 400 \(-10% vs previous period\)/)
})

test("the digest names every decoy, including one that saw nothing worth reporting", () => {
  const d = buildNarrativeDigest(data)
  assert.match(d, /edge-ssh \(ssh, online\): 120 events \(60.0% of client\)/)
  assert.match(d, /portal-web \(http, offline\)/)
  assert.match(d, /HTTP hits: 400 across 40 observed sessions \(31 fingerprinted\)/)
  assert.match(d, /Canary hits: 12, chained requests: 26/)
  assert.match(d, /Attack types: sqli 90, path-traversal 40/)
})

test("a client with no HTTP decoy says so instead of printing zeros", () => {
  const d = buildNarrativeDigest({ ...data, sensors: [] } as unknown as ClientReportData)
  assert.match(d, /## HTTP decoy activity\nno HTTP decoy activity/)
})

test("a missing lake section degrades to a marker, not a crash", () => {
  const d = buildNarrativeDigest({ ...data, history: null })
  assert.match(d, /Long-range history from the analytics lake\nnot available/)
})

test("empty collections render as 'none' rather than blank headings", () => {
  const d = buildNarrativeDigest({
    ...data, mitre: { tactics: [], total: 0 }, geo: [], topCredentials: [], sensors: [],
  } as unknown as ClientReportData)
  assert.match(d, /## MITRE ATT&CK tactics observed\nnone/)
  assert.match(d, /none/)
})

// The model is free-form: it can omit a key, invent one, or return a blank
// string. None of that should reach the report as an empty note box.
test("pickSections keeps only known keys with real prose", () => {
  const picked = pickSections({
    timeline: "Traffic peaked on the 29th.",
    mitre: "   ",
    geo: "",
    madeUpKey: "should not survive",
    credentials: 42,
    classification: "  Almost all automated.  ",
  })
  assert.deepEqual(picked, {
    timeline: "Traffic peaked on the 29th.",
    classification: "Almost all automated.",
  })
})

test("pickSections tolerates the model returning nothing usable", () => {
  assert.deepEqual(pickSections(undefined), {})
  assert.deepEqual(pickSections(null), {})
  assert.deepEqual(pickSections("not an object"), {})
  assert.deepEqual(pickSections({}), {})
})
