import { getApiUrl, apiFetch, buildSearchParams } from "./client"
import type { DashboardStats, DashboardInsights } from "./types"

export async function fetchOverviewStats(params: {
  startDate: string; endDate: string
  range: "day" | "week" | "month"; timezone?: string
}): Promise<DashboardStats> {
  const sp = buildSearchParams({ ...params })
  return apiFetch(`${getApiUrl()}/stats/overview?${sp}`)
}

export async function fetchGeoSummary(): Promise<{ srcIp: string; loginSuccess: boolean | null }[]> {
  const res = await fetch(`${getApiUrl()}/stats/geo`, { cache: "no-store" })
  if (!res.ok) return []
  return res.json()
}

export async function fetchDashboardInsights(): Promise<DashboardInsights> {
  return apiFetch(`${getApiUrl()}/stats/dashboards`)
}

export async function fetchSessionCommands(): Promise<Record<string, string[]>> {
  const res = await fetch(`${getApiUrl()}/stats/session-commands?limit=5000`, { cache: "no-store" })
  if (!res.ok) return {}
  return res.json()
}
