import { getApiUrl, apiFetch, buildSearchParams } from "./client"
import { sensorScopeParam } from "./stats"
import type { ThreatSummary, ThreatDetail, PaginatedThreatsResponse, RiskLevel } from "./types"

export async function fetchThreatsPage(params?: {
  page?: number; pageSize?: number; limit?: number; offset?: number
  q?: string; level?: RiskLevel; levels?: RiskLevel[]; commands?: string[]
  crossProtocol?: boolean
  sortBy?: 'score' | 'sessions' | 'webHits' | 'protocols'
  sortDir?: 'asc' | 'desc'
  clientSlug?: string; sensorId?: string
  period?: '24h' | '7d' | '30d' | '90d'
}, sensorIds?: string[]): Promise<PaginatedThreatsResponse> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize,
    limit: params?.limit, offset: params?.offset,
    q: params?.q, level: params?.level,
    clientSlug: params?.clientSlug, sensorId: params?.sensorId,
  })
  if (params?.levels?.length) sp.set("levels", params.levels.join(","))
  if (params?.commands?.length) sp.set("commands", params.commands.join(","))
  if (params?.crossProtocol !== undefined) sp.set("crossProtocol", String(params.crossProtocol))
  if (params?.sortBy) sp.set("sortBy", params.sortBy)
  if (params?.sortDir) sp.set("sortDir", params.sortDir)
  if (params?.period) sp.set("period", params.period)
  // Cross-protocol correlation is a heavy aggregate; give it 30s before aborting
  // so a slow query doesn't surface as an empty threats page.
  return apiFetch(`${getApiUrl()}/threats?${sp}${sensorScopeParam(sensorIds)}`, 60, 30000)
}

export async function fetchThreats(params?: Parameters<typeof fetchThreatsPage>[0], sensorIds?: string[]): Promise<ThreatSummary[]> {
  return (await fetchThreatsPage({ pageSize: 1000, ...params }, sensorIds)).items
}

export async function fetchThreat(ip: string, sensorIds?: string[]): Promise<ThreatDetail> {
  return apiFetch(`${getApiUrl()}/threats/${encodeURIComponent(ip)}?_=1${sensorScopeParam(sensorIds)}`)
}
