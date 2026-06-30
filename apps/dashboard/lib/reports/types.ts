import type {
  HoneypotOverview,
  KpiTrends,
  CrossSensorTimeline,
  MitreMatrix,
  BotRatio,
  DashboardInsights,
  CredentialsSummary,
  DiversifiedAttackerStat,
} from "@/lib/api/types"
import type { Sensor } from "@/lib/api/services"
import type { MalwareArtifact } from "@/lib/api/malware"

export type ReportRange = "week" | "month"

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

export interface ReportSensorProfile {
  sensor: Sensor
  eventShare: number
  uniqueIps: number
  authAttempts: number
  successCount: number
  commandCount: number
  malwareCount: number
  topAttackers: ReportTopIp[]
  topCredentials: ReportTopCredential[]
  topSignals: ReportLabelCount[]
  topTargets: ReportLabelCount[]
  recentMalware: MalwareArtifact[]
  eventBreakdown: ReportLabelCount[]
  sourcePorts: ReportLabelCount[]
  sourceServices: ReportLabelCount[]
  fileTransfers: ReportDetailCount[]
  // Protocol-specific intelligence — populated only for the relevant traffic the
  // sensor observed (a multi-protocol sensor like dionaea can fill several).
  ftpCommands: ReportLabelCount[]
  smbDomains: ReportLabelCount[]
  smbShares: ReportLabelCount[]
  smbHosts: ReportDetailCount[]
  smbNtlmHashes: ReportDetailCount[]
  databases: ReportLabelCount[]
  scannedPorts: ReportLabelCount[]
  web?: ReportWebProfile
}

export interface ClientReportMeta {
  clientName: string
  clientSlug: string
  range: ReportRange
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
}
