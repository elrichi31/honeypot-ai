import type {
  HoneypotOverview,
  KpiTrends,
  CrossSensorTimeline,
  MitreMatrix,
  BotRatio,
  DashboardInsights,
} from "@/lib/api/types"

export type ReportRange = "week" | "month"

export interface ReportGeoEntry {
  country: string
  count: number
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
}
