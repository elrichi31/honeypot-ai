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
