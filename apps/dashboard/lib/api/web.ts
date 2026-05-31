import { getApiUrl, apiFetch, buildSearchParams } from "./client"
import type { WebHit, WebHitByIp, PaginatedResponse } from "./types"

export async function fetchWebHits(params?: {
  limit?: number; offset?: number; attackType?: string; srcIp?: string
}): Promise<{ total: number; hits: WebHit[] }> {
  const sp = buildSearchParams({
    limit: params?.limit, offset: params?.offset,
    attackType: params?.attackType, srcIp: params?.srcIp,
  })
  return apiFetch(`${getApiUrl()}/web-hits?${sp}`, 30)
}

export async function fetchWebTimeline(): Promise<{
  days: ({ day: string } & Record<string, number>)[]; attackTypes: string[]
}> {
  const res = await fetch(`${getApiUrl()}/web-hits/timeline`, { next: { revalidate: 300 } })
  if (!res.ok) return { days: [], attackTypes: [] }
  return res.json()
}

export async function fetchWebPaths(): Promise<{
  paths: { path: string; total: number; byType: Record<string, number> }[]
}> {
  const res = await fetch(`${getApiUrl()}/web-hits/paths`, { next: { revalidate: 300 } })
  if (!res.ok) return { paths: [] }
  return res.json()
}

export async function fetchWebHitsByIpPage(params?: {
  page?: number; pageSize?: number; limit?: number; offset?: number; q?: string
  sortBy?: 'totalHits' | 'lastSeen' | 'firstSeen'
  sortDir?: 'asc' | 'desc'
}): Promise<PaginatedResponse<WebHitByIp>> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize,
    limit: params?.limit, offset: params?.offset, q: params?.q,
  })
  if (params?.sortBy) sp.set('sortBy', params.sortBy)
  if (params?.sortDir) sp.set('sortDir', params.sortDir)
  return apiFetch(`${getApiUrl()}/web-hits/by-ip?${sp}`, 30)
}

export async function fetchWebHitsByIp(params?: Parameters<typeof fetchWebHitsByIpPage>[0]): Promise<WebHitByIp[]> {
  return (await fetchWebHitsByIpPage({ pageSize: 1000, ...params })).items
}

export async function fetchWebHitsStats(): Promise<{
  total: number
  byAttackType: { attackType: string; count: number }[]
  topIps: { srcIp: string; count: number }[]
}> {
  return apiFetch(`${getApiUrl()}/web-hits/stats`, 60)
}
