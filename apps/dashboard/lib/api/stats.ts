import { getApiUrl, apiFetch, buildSearchParams } from "./client"
import type { DashboardStats, DashboardInsights, HoneypotOverview, CrossSensorTimeline, KpiTrends, MitreMatrix, NoveltyStats, AttackerIntel, BotRatio } from "./types"

// Tenant scope → query fragment. `undefined` means "global" (no filter). An
// empty array means "this tenant has no sensors" → send a sentinel so the
// backend returns nothing (fail-closed) instead of falling back to global.
export function sensorScopeParam(sensorIds?: string[]): string {
  if (sensorIds === undefined) return ""
  if (sensorIds.length === 0) return "&sensorIds=__none__"
  return `&sensorIds=${encodeURIComponent(sensorIds.join(","))}`
}

export async function fetchOverviewStats(params: {
  startDate: string; endDate: string
  range: "day" | "week" | "month"; timezone?: string
}): Promise<DashboardStats> {
  const sp = buildSearchParams({ ...params })
  return apiFetch(`${getApiUrl()}/stats/overview?${sp}`)
}

export async function fetchGeoSummary(sensorIds?: string[]): Promise<{ srcIp: string; loginSuccess: boolean | null }[]> {
  const res = await fetch(`${getApiUrl()}/stats/geo?_=1${sensorScopeParam(sensorIds)}`, { next: { revalidate: 600 } })
  if (!res.ok) return []
  return res.json()
}

// /stats/dashboards runs 8 heavy aggregate queries and /stats/honeypot-overview
// runs 4; on a cold cache the first request can exceed the default 10s timeout,
// which aborts before the result is cached, so it never warms up. Give them 30s
// so the first load completes and populates the 30-min server cache.
export async function fetchDashboardInsights(sensorIds?: string[]): Promise<DashboardInsights> {
  return apiFetch(`${getApiUrl()}/stats/dashboards?_=1${sensorScopeParam(sensorIds)}`, 300, 30000)
}

export async function fetchHoneypotOverview(sensorIds?: string[]): Promise<HoneypotOverview> {
  return apiFetch(`${getApiUrl()}/stats/honeypot-overview?_=1${sensorScopeParam(sensorIds)}`, 300, 30000)
}

export async function fetchKpiTrends(sensorIds?: string[]): Promise<KpiTrends> {
  return apiFetch(`${getApiUrl()}/stats/kpi-trends?_=1${sensorScopeParam(sensorIds)}`, 300, 30000)
}

export async function fetchMitreMatrix(sensorIds?: string[]): Promise<MitreMatrix> {
  return apiFetch(`${getApiUrl()}/stats/mitre-matrix?_=1${sensorScopeParam(sensorIds)}`, 300, 30000)
}

export async function fetchCrossSensorTimeline(params: {
  range: "day" | "week" | "month"
  timezone?: string
  sensorIds?: string[]
}): Promise<CrossSensorTimeline> {
  const { sensorIds, ...rest } = params
  const sp = buildSearchParams({ ...rest })
  return apiFetch(`${getApiUrl()}/stats/cross-sensor-timeline?${sp}${sensorScopeParam(sensorIds)}`, 120)
}

export async function fetchSessionCommands(): Promise<Record<string, string[]>> {
  const res = await fetch(`${getApiUrl()}/stats/session-commands?limit=5000`, { cache: "no-store" })
  if (!res.ok) return {}
  return res.json()
}

export async function fetchNovelty(hours = 24, sensorIds?: string[]): Promise<NoveltyStats> {
  return apiFetch(`${getApiUrl()}/stats/novelty?hours=${hours}${sensorScopeParam(sensorIds)}`, 300)
}

export async function fetchBotRatio(sensorIds?: string[]): Promise<BotRatio> {
  return apiFetch(`${getApiUrl()}/stats/bot-ratio?_=1${sensorScopeParam(sensorIds)}`, 300)
}
