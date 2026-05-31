import { getApiUrl, apiFetch, buildSearchParams } from "./client"
import type { ThreatSummary, ThreatDetail, PaginatedThreatsResponse, RiskLevel } from "./types"

export async function fetchThreatsPage(params?: {
  page?: number; pageSize?: number; limit?: number; offset?: number
  q?: string; level?: RiskLevel; crossProtocol?: boolean
  sortBy?: 'score' | 'sessions' | 'webHits' | 'protocols'
  sortDir?: 'asc' | 'desc'
}): Promise<PaginatedThreatsResponse> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize,
    limit: params?.limit, offset: params?.offset,
    q: params?.q, level: params?.level,
  })
  if (params?.crossProtocol !== undefined) sp.set("crossProtocol", String(params.crossProtocol))
  if (params?.sortBy) sp.set("sortBy", params.sortBy)
  if (params?.sortDir) sp.set("sortDir", params.sortDir)
  return apiFetch(`${getApiUrl()}/threats?${sp}`, 60)
}

export async function fetchThreats(params?: Parameters<typeof fetchThreatsPage>[0]): Promise<ThreatSummary[]> {
  return (await fetchThreatsPage({ pageSize: 1000, ...params })).items
}

export async function fetchThreat(ip: string): Promise<ThreatDetail> {
  return apiFetch(`${getApiUrl()}/threats/${encodeURIComponent(ip)}`)
}
