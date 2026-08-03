import type {
  HoneypotOverview,
  KpiTrends,
  CrossSensorTimeline,
  MitreMatrix,
  BotRatio,
  DashboardInsights,
  CredentialsSummary,
  DiversifiedAttackerStat,
  RiskLevel,
} from "@/lib/api/types"
import type { AggregatedIocsResponse } from "@/lib/api/iocs"
import type { ThreatAnalysis } from "@/lib/ai/threat-analyze"
import type { AnalyticsCredentialCombo, AnalyticsRange } from "@/lib/api/analytics"
import type { Sensor } from "@/lib/api/services"
import type { MalwareArtifact } from "@/lib/api/malware"

export interface ReportGeoEntry {
  country: string
  countryCode: string
  count: number
  successCount: number
  share: number
}

export interface ReportTopCredential {
  username: string | null
  password: string | null
  attempts: number
  successCount: number
}

export interface ReportTopIp {
  srcIp: string
  count: number
}

export interface ReportLabelCount {
  label: string
  count: number
}

export interface ReportDetailCount {
  label: string
  detail?: string | null
  count: number
}

export interface ReportWebSessionSummary {
  label: string
  hits: number
  ipCount: number
  chainHits: number
  canaryHits: number
  attackTypes: string[]
  topPaths: string[]
}

export interface ReportWebProfile {
  hits: number
  uniquePaths: number
  attackTypeCount: number
  sessionCount: number
  fingerprintedSessions: number
  multiIpSessions: number
  canaryHits: number
  chainHits: number
  topAttackTypes: ReportLabelCount[]
  topPaths: ReportLabelCount[]
  topMethods: ReportLabelCount[]
  topUserAgents: ReportLabelCount[]
  topCanaryTokens: ReportLabelCount[]
  topSessions: ReportWebSessionSummary[]
}

export interface ReportDailyBucket {
  date: string  // YYYY-MM-DD
  count: number
}

export interface ReportHourBucket {
  hour: number  // 0-23
  count: number
}

export interface ReportEnrichedAttacker {
  ip: string
  country: string
  org: string
  abuseScore: number
  hits: number
}

export interface ReportSuricataAlert {
  signature: string
  category: string
  severity: number
  count: number
}

export interface ReportSshFingerprint {
  clientVersion: string
  sessions: number
  successes: number
}

export interface ReportCredentialCampaign {
  username: string
  password: string
  attempts: number
  ips: number
}

export interface ReportPersistentAttacker {
  ip: string
  activeDays: number
  totalHits: number
}

export interface ReportSensorProfile {
  sensor: Sensor
  eventShare: number
  uniqueIps: number
  dailyActivity: ReportDailyBucket[]
  hourlyActivity: ReportHourBucket[]
  authAttempts: number
  successCount: number
  commandCount: number
  malwareCount: number
  topAttackers: ReportTopIp[]
  topEnrichedAttackers: ReportEnrichedAttacker[]
  topCredentials: ReportTopCredential[]
  topSignals: ReportLabelCount[]
  topTargets: ReportLabelCount[]
  recentMalware: MalwareArtifact[]
  eventBreakdown: ReportLabelCount[]
  sourcePorts: ReportLabelCount[]
  sourceServices: ReportLabelCount[]
  fileTransfers: ReportDetailCount[]
  ftpCommands: ReportLabelCount[]
  smbDomains: ReportLabelCount[]
  smbShares: ReportLabelCount[]
  smbHosts: ReportDetailCount[]
  smbNtlmHashes: ReportDetailCount[]
  databases: ReportLabelCount[]
  scannedPorts: ReportLabelCount[]
  suricataAlerts: ReportSuricataAlert[]
  sshFingerprints: ReportSshFingerprint[]
  credentialCampaigns: ReportCredentialCampaign[]
  persistentAttackers: ReportPersistentAttacker[]
  web?: ReportWebProfile
}

// Long-range context from the ClickHouse lake, deliberately outside the
// report's Postgres window. `null` when the lake is unavailable (503) — the
// section is then omitted rather than shown empty.
export interface ReportHistory {
  range: AnalyticsRange
  // Actual span the lake could answer for, not the span that was asked for:
  // Postgres retention prunes what the backfill could copy, so a 1y request
  // can come back holding weeks. The report must show what it really has.
  firstBucket: string | null
  lastBucket: string | null
  totalEvents: number
  byProtocol: { label: string; count: number }[]
  totalAttempts: number
  successRatePct: number
  topCredentials: AnalyticsCredentialCombo[]
}

/** One high-risk actor as the report shows it: honeypot evidence, external
 *  reputation from the enrichment cache, and the deep AI analysis when one is
 *  available (cached from the threats page, or generated for this report). */
export interface ReportActorIntel {
  ip: string
  score: number
  level: RiskLevel
  protocols: string[]
  crossProtocol: boolean
  topFactors: string[]
  sshSessions: number
  loginSuccess: boolean
  commandCount: number
  webHits: number
  protocolHits: number
  ports: number[]
  country: string | null
  org: string | null
  usageType: string | null
  hosting: boolean
  abuseScore: number | null
  abuseReports: number | null
  lastReportedAt: string | null
  vtMalicious: number | null
  vtEngineCount: number | null
  vtFlaggedBy: string[]
  analysis: ThreatAnalysis | null
}

export interface ReportThreatIntel {
  actors: ReportActorIntel[]
  iocs: AggregatedIocsResponse
}

/** Palette the report renders in, independent of the (dark-only) app chrome.
 *  Drives both the on-screen preview and the printed PDF — they must match. */
export type ReportTheme = "light" | "dark"

// AI-written sections. Arrives after the report data (separate SSE event), so
// the report is never blocked on an LLM call; absent when OpenAI is not
// configured or the call failed.
export interface ReportNarrative {
  executiveSummary: string
  threatLandscape: string
  credentialFindings: string
  recommendations: string[]
  /** One observation per report section, keyed by NARRATIVE_SECTIONS. Sparse:
   *  a section with nothing noteworthy is omitted rather than padded. */
  sections: Partial<Record<string, string>>
  generatedAt: string
}

export interface ClientReportMeta {
  clientName: string
  clientSlug: string
  startDate: string
  endDate: string
  timezone: string
  generatedAt: string
  periodLabel: string
}

export interface ClientReportData {
  meta: ClientReportMeta
  overview: HoneypotOverview
  kpiTrends: KpiTrends
  timeline: CrossSensorTimeline
  mitre: MitreMatrix
  botRatio: BotRatio
  insights: DashboardInsights
  geo: ReportGeoEntry[]
  topCredentials: ReportTopCredential[]
  credentialSummary: CredentialsSummary
  diversifiedAttackers: DiversifiedAttackerStat[]
  sensors: ReportSensorProfile[]
  malware: MalwareArtifact[]
  history: ReportHistory | null
  /** `null` when the tenant has no scoped sensors or the threats endpoint failed. */
  threatIntel: ReportThreatIntel | null
}
