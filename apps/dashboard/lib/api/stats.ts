import { getApiUrl, apiFetch, buildSearchParams } from "./client"
import type { DashboardStats, DashboardInsights, HoneypotOverview, CrossSensorTimeline } from "./types"

export async function fetchOverviewStats(params: {
  startDate: string; endDate: string
  range: "day" | "week" | "month"; timezone?: string
}): Promise<DashboardStats> {
  const sp = buildSearchParams({ ...params })
  return apiFetch(`${getApiUrl()}/stats/overview?${sp}`)
}

export async function fetchGeoSummary(): Promise<{ srcIp: string; loginSuccess: boolean | null }[]> {
  const res = await fetch(`${getApiUrl()}/stats/geo`, { next: { revalidate: 600 } })
  if (!res.ok) return []
  return res.json()
}

// /stats/dashboards runs 8 heavy aggregate queries and /stats/honeypot-overview
// runs 4; on a cold cache the first request can exceed the default 10s timeout,
// which aborts before the result is cached, so it never warms up. Give them 30s
// so the first load completes and populates the 30-min server cache.
export async function fetchDashboardInsights(): Promise<DashboardInsights> {
  return apiFetch(`${getApiUrl()}/stats/dashboards`, 300, 30000)
}

export async function fetchHoneypotOverview(): Promise<HoneypotOverview> {
  return apiFetch(`${getApiUrl()}/stats/honeypot-overview`, 300, 30000)
}

export async function fetchCrossSensorTimeline(params: {
  range: "day" | "week" | "month"
  timezone?: string
}): Promise<CrossSensorTimeline> {
  const sp = buildSearchParams({ ...params })
  return apiFetch(`${getApiUrl()}/stats/cross-sensor-timeline?${sp}`, 120)
}

export async function fetchSessionCommands(): Promise<Record<string, string[]>> {
  const res = await fetch(`${getApiUrl()}/stats/session-commands?limit=5000`, { cache: "no-store" })
  if (!res.ok) return {}
  return res.json()
}
