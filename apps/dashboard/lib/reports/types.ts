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
}
