import { getApiUrl, apiFetch, buildSearchParams } from "./client"
import type { ThreatSummary, ThreatDetail, PaginatedThreatsResponse, RiskLevel } from "./types"

export async function fetchThreatsPage(params?: {
  page?: number; pageSize?: number; limit?: number; offset?: number
  q?: string; level?: RiskLevel; crossProtocol?: boolean
}): Promise<PaginatedThreatsResponse> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize,
    limit: params?.limit, offset: params?.offset,
    q: params?.q, level: params?.level,
  })
  if (params?.crossProtocol !== undefined) sp.set("crossProtocol", String(params.crossProtocol))
  return apiFetch(`${getApiUrl()}/threats?${sp}`)
}

export async function fetchThreats(params?: Parameters<typeof fetchThreatsPage>[0]): Promise<ThreatSummary[]> {
  return (await fetchThreatsPage({ pageSize: 1000, ...params })).items
}

export async function fetchThreat(ip: string): Promise<ThreatDetail> {
  return apiFetch(`${getApiUrl()}/threats/${encodeURIComponent(ip)}`)
}
