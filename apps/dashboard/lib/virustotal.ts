import { db } from "@/lib/db"

// ---------------------------------------------------------------------------
// Types — mirrors every field the free-tier API returns
// ---------------------------------------------------------------------------

export interface VtAnalysisStats {
  malicious: number
  suspicious: number
  undetected: number
  harmless: number
  timeout: number
}

export interface VtEngineResult {
  category: string        // "malicious" | "suspicious" | "harmless" | "undetected" | "timeout"
  engine_name: string
  engine_version: string | null
  engine_update: string | null
  method: string
  result: string | null
}

export interface VtCertificate {
  thumbprint?: string
  subject?: { CN?: string; O?: string; C?: string }
  issuer?: { CN?: string; O?: string }
  validity?: { not_before?: string; not_after?: string }
  serial_number?: string
  version?: string
}

export interface VtIpData {
  // Network identification
  asn: number | null
  as_owner: string | null
  network: string | null
  country: string | null
  continent: string | null
  regional_internet_registry: string | null
  // Analysis
  last_analysis_date: number | null
  last_analysis_stats: VtAnalysisStats
  last_analysis_results: Record<string, VtEngineResult>
  // Reputation
  reputation: number
  total_votes: { harmless: number; malicious: number }
  tags: string[]
  // TLS / WHOIS
  jarm: string | null
  last_https_certificate: VtCertificate | null
  last_https_certificate_date: number | null
  whois: string | null
  whois_date: number | null
  last_modification_date: number | null
}

export interface VtYaraResult {
  rule_name: string
  ruleset_name: string
  description: string | null
  rule_source: string | null
  match_in_subfile: boolean
}

export interface VtSigmaResult {
  rule_title: string
  rule_source: string
  rule_level: string         // "critical" | "high" | "medium" | "low"
  rule_description: string | null
  rule_author: string | null
  rule_id: string
}

export interface VtSandboxVerdict {
  sandbox_name: string
  category: string
  confidence: number
  malware_names: string[]
  malware_classification: string[]
}

export interface VtFileData {
  // Hashes
  md5: string
  sha1: string
  sha256: string
  tlsh: string | null
  vhash: string | null
  // Metadata
  size: number | null
  type_tag: string | null
  type_tags: string[]
  type_description: string | null
  type_extension: string | null
  meaningful_name: string | null
  names: string[]
  // Timeline
  creation_date: number | null
  first_submission_date: number | null
  last_submission_date: number | null
  last_analysis_date: number | null
  times_submitted: number
  // Detection
  last_analysis_stats: VtAnalysisStats & {
    "confirmed-timeout"?: number
    failure?: number
    "type-unsupported"?: number
  }
  last_analysis_results: Record<string, VtEngineResult>
  // Reputation & community
  reputation: number
  total_votes: { harmless: number; malicious: number }
  tags: string[]
  // Threat intelligence
  crowdsourced_yara_results: VtYaraResult[]
  sigma_analysis_results: VtSigmaResult[]
  sigma_analysis_stats: { critical: number; high: number; medium: number; low: number } | null
  sandbox_verdicts: Record<string, VtSandboxVerdict>
  // AI / crowdsourced
  crowdsourced_ai_results: { analysis: string; source: string } | null
}

export interface VtQuotaUsage {
  today: number
  thisMonth: number
  dailyLimit: number
  monthlyLimit: number
  dailyRemaining: number
  monthlyRemaining: number
}

// ---------------------------------------------------------------------------
// Quota tracking (PostgreSQL-backed, survives restarts)
// ---------------------------------------------------------------------------

const DAILY_LIMIT   = 480   // soft cap — never touch the hard 500
const MONTHLY_LIMIT = 15_000 // soft cap — hard limit is 15 500

async function getToday(): Promise<string> {
  return new Date().toISOString().slice(0, 10)   // "YYYY-MM-DD" UTC
}

export async function getVtQuota(): Promise<VtQuotaUsage> {
  const today = await getToday()
  const monthStart = today.slice(0, 7) + "-01"   // "YYYY-MM-01"

  const { rows } = await db.query<{ day: string; requests: number }>(
    `SELECT day::text, requests FROM vt_quota_log
     WHERE day >= $1
     ORDER BY day`,
    [monthStart],
  )

  const todayRow  = rows.find((r) => r.day === today)
  const todayUsed = todayRow?.requests ?? 0
  const monthUsed = rows.reduce((s, r) => s + r.requests, 0)

  return {
    today:            todayUsed,
    thisMonth:        monthUsed,
    dailyLimit:       DAILY_LIMIT,
    monthlyLimit:     MONTHLY_LIMIT,
    dailyRemaining:   Math.max(0, DAILY_LIMIT   - todayUsed),
    monthlyRemaining: Math.max(0, MONTHLY_LIMIT - monthUsed),
  }
}

async function incrementQuota(): Promise<void> {
  const today = await getToday()
  await db.query(
    `INSERT INTO vt_quota_log (day, requests)
     VALUES ($1, 1)
     ON CONFLICT (day) DO UPDATE SET requests = vt_quota_log.requests + 1`,
    [today],
  )
}

async function canMakeRequest(): Promise<boolean> {
  const q = await getVtQuota()
  return q.dailyRemaining > 0 && q.monthlyRemaining > 0
}

// ---------------------------------------------------------------------------
// Rate limiting — 4 req/min via a simple in-process queue
// ---------------------------------------------------------------------------

const RATE_WINDOW_MS = 60_000
const MAX_PER_WINDOW = 4
const callTimestamps: number[] = []

function waitForSlot(): Promise<void> {
  return new Promise((resolve) => {
    function attempt() {
      const now = Date.now()
      // Drop timestamps older than the window
      while (callTimestamps.length > 0 && now - callTimestamps[0] > RATE_WINDOW_MS) {
        callTimestamps.shift()
      }
      if (callTimestamps.length < MAX_PER_WINDOW) {
        callTimestamps.push(now)
        resolve()
      } else {
        const wait = RATE_WINDOW_MS - (now - callTimestamps[0]) + 50
        setTimeout(attempt, wait)
      }
    }
    attempt()
  })
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

async function vtGet<T>(path: string, apiKey: string): Promise<T | null> {
  if (!(await canMakeRequest())) return null
  await waitForSlot()
  try {
    const res = await fetch(`https://www.virustotal.com/api/v3${path}`, {
      headers: { "x-apikey": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    })
    if (res.status === 429 || res.status === 204) return null
    if (!res.ok) return null
    await incrementQuota()
    const json = await res.json()
    return json.data?.attributes ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchVtIp(ip: string, apiKey: string): Promise<VtIpData | null> {
  const attrs = await vtGet<Record<string, unknown>>(`/ip_addresses/${encodeURIComponent(ip)}`, apiKey)
  if (!attrs) return null

  const stats = (attrs.last_analysis_stats ?? {}) as Record<string, number>
  return {
    asn:                          (attrs.asn as number)          ?? null,
    as_owner:                     (attrs.as_owner as string)     ?? null,
    network:                      (attrs.network as string)      ?? null,
    country:                      (attrs.country as string)      ?? null,
    continent:                    (attrs.continent as string)    ?? null,
    regional_internet_registry:   (attrs.regional_internet_registry as string) ?? null,
    last_analysis_date:           (attrs.last_analysis_date as number) ?? null,
    last_analysis_stats: {
      malicious:   stats.malicious   ?? 0,
      suspicious:  stats.suspicious  ?? 0,
      undetected:  stats.undetected  ?? 0,
      harmless:    stats.harmless    ?? 0,
      timeout:     stats.timeout     ?? 0,
    },
    last_analysis_results:        (attrs.last_analysis_results as Record<string, VtEngineResult>) ?? {},
    reputation:                   (attrs.reputation as number)   ?? 0,
    total_votes: {
      harmless:   ((attrs.total_votes as Record<string, number>)?.harmless  ?? 0),
      malicious:  ((attrs.total_votes as Record<string, number>)?.malicious ?? 0),
    },
    tags:                         (attrs.tags as string[])       ?? [],
    jarm:                         (attrs.jarm as string)         ?? null,
    last_https_certificate:       (attrs.last_https_certificate as VtCertificate) ?? null,
    last_https_certificate_date:  (attrs.last_https_certificate_date as number)   ?? null,
    whois:                        (attrs.whois as string)        ?? null,
    whois_date:                   (attrs.whois_date as number)   ?? null,
    last_modification_date:       (attrs.last_modification_date as number) ?? null,
  }
}

export async function fetchVtFile(hash: string, apiKey: string): Promise<VtFileData | null> {
  const attrs = await vtGet<Record<string, unknown>>(`/files/${encodeURIComponent(hash)}`, apiKey)
  if (!attrs) return null

  const stats = (attrs.last_analysis_stats ?? {}) as Record<string, number>
  return {
    md5:                   (attrs.md5 as string)                  ?? "",
    sha1:                  (attrs.sha1 as string)                 ?? "",
    sha256:                (attrs.sha256 as string)               ?? "",
    tlsh:                  (attrs.tlsh as string)                 ?? null,
    vhash:                 (attrs.vhash as string)                ?? null,
    size:                  (attrs.size as number)                 ?? null,
    type_tag:              (attrs.type_tag as string)             ?? null,
    type_tags:             (attrs.type_tags as string[])          ?? [],
    type_description:      (attrs.type_description as string)     ?? null,
    type_extension:        (attrs.type_extension as string)       ?? null,
    meaningful_name:       (attrs.meaningful_name as string)      ?? null,
    names:                 (attrs.names as string[])              ?? [],
    creation_date:         (attrs.creation_date as number)        ?? null,
    first_submission_date: (attrs.first_submission_date as number) ?? null,
    last_submission_date:  (attrs.last_submission_date as number)  ?? null,
    last_analysis_date:    (attrs.last_analysis_date as number)    ?? null,
    times_submitted:       (attrs.times_submitted as number)       ?? 0,
    last_analysis_stats: {
      malicious:              stats.malicious              ?? 0,
      suspicious:             stats.suspicious             ?? 0,
      undetected:             stats.undetected             ?? 0,
      harmless:               stats.harmless               ?? 0,
      timeout:                stats.timeout                ?? 0,
      "confirmed-timeout":    stats["confirmed-timeout"]   ?? 0,
      failure:                stats.failure                ?? 0,
      "type-unsupported":     stats["type-unsupported"]    ?? 0,
    },
    last_analysis_results: (attrs.last_analysis_results as Record<string, VtEngineResult>) ?? {},
    reputation:            (attrs.reputation as number)            ?? 0,
    total_votes: {
      harmless:  ((attrs.total_votes as Record<string, number>)?.harmless  ?? 0),
      malicious: ((attrs.total_votes as Record<string, number>)?.malicious ?? 0),
    },
    tags:                        (attrs.tags as string[])          ?? [],
    crowdsourced_yara_results:   (attrs.crowdsourced_yara_results as VtYaraResult[]) ?? [],
    sigma_analysis_results:      (attrs.sigma_analysis_results as VtSigmaResult[])  ?? [],
    sigma_analysis_stats:        (attrs.sigma_analysis_stats as VtFileData["sigma_analysis_stats"]) ?? null,
    sandbox_verdicts:            (attrs.sandbox_verdicts as Record<string, VtSandboxVerdict>) ?? {},
    crowdsourced_ai_results:     (attrs.crowdsourced_ai_results as VtFileData["crowdsourced_ai_results"]) ?? null,
  }
}
