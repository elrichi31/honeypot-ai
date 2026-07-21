import { getApiUrl, apiFetch, buildSearchParams } from "./client"
import { sensorScopeParam } from "./stats"
import type { WebHit, WebHitByIp, WebBurst, WebHourlyCell, WebSession, PaginatedResponse } from "./types"

export async function fetchWebHits(params?: {
  limit?: number; offset?: number; attackType?: string; srcIp?: string
}, sensorIds?: string[]): Promise<{ total: number; hits: WebHit[] }> {
  const sp = buildSearchParams({
    limit: params?.limit, offset: params?.offset,
    attackType: params?.attackType, srcIp: params?.srcIp,
  })
  return apiFetch(`${getApiUrl()}/web-hits?${sp}${sensorScopeParam(sensorIds)}`, 30)
}

export async function fetchWebTimeline(sensorIds?: string[]): Promise<{
  days: ({ day: string } & Record<string, number>)[]; attackTypes: string[]
}> {
  const res = await fetch(`${getApiUrl()}/web-hits/timeline?_=1${sensorScopeParam(sensorIds)}`, { next: { revalidate: 300 } })
  if (!res.ok) return { days: [], attackTypes: [] }
  return res.json()
}

export async function fetchWebPaths(sensorIds?: string[]): Promise<{
  paths: { path: string; total: number; byType: Record<string, number> }[]
}> {
  const res = await fetch(`${getApiUrl()}/web-hits/paths?_=1${sensorScopeParam(sensorIds)}`, { next: { revalidate: 300 } })
  if (!res.ok) return { paths: [] }
  return res.json()
}

export async function fetchWebHitsByIpPage(params?: {
  page?: number; pageSize?: number; limit?: number; offset?: number; q?: string
  attackType?: string
  range?: string
  clientSlug?: string
  sensorId?: string
  sortBy?: 'totalHits' | 'lastSeen' | 'firstSeen'
  sortDir?: 'asc' | 'desc'
}, sensorIds?: string[]): Promise<PaginatedResponse<WebHitByIp>> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize,
    limit: params?.limit, offset: params?.offset, q: params?.q,
    attackType: params?.attackType, range: params?.range,
    clientSlug: params?.clientSlug, sensorId: params?.sensorId,
  })
  if (params?.sortBy) sp.set('sortBy', params.sortBy)
  if (params?.sortDir) sp.set('sortDir', params.sortDir)
  return apiFetch(`${getApiUrl()}/web-hits/by-ip?${sp}${sensorScopeParam(sensorIds)}`, 30)
}

export async function fetchWebHitsByIp(params?: Parameters<typeof fetchWebHitsByIpPage>[0], sensorIds?: string[]): Promise<WebHitByIp[]> {
  return (await fetchWebHitsByIpPage({ pageSize: 1000, ...params }, sensorIds)).items
}

export async function fetchWebBursts(params?: {
  page?: number; pageSize?: number; q?: string; attackType?: string; range?: string; gapMinutes?: number
  clientSlug?: string; sensorId?: string
  sortBy?: 'startedAt' | 'hits' | 'durationSec' | 'intensity'
  sortDir?: 'asc' | 'desc'
}, sensorIds?: string[]): Promise<PaginatedResponse<WebBurst>> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize, q: params?.q,
    attackType: params?.attackType, range: params?.range, gapMinutes: params?.gapMinutes,
    clientSlug: params?.clientSlug, sensorId: params?.sensorId,
  })
  if (params?.sortBy) sp.set('sortBy', params.sortBy)
  if (params?.sortDir) sp.set('sortDir', params.sortDir)
  return apiFetch(`${getApiUrl()}/web-hits/bursts?${sp}${sensorScopeParam(sensorIds)}`, 30)
}

export async function fetchWebHourly(params?: { range?: string }, sensorIds?: string[]): Promise<{ cells: WebHourlyCell[] }> {
  const sp = buildSearchParams({ range: params?.range })
  const qs = sp.toString()
  const res = await fetch(`${getApiUrl()}/web-hits/hourly?${qs}${sensorScopeParam(sensorIds)}`, { next: { revalidate: 300 } })
  if (!res.ok) return { cells: [] }
  return res.json()
}

export async function fetchWebSessions(params?: {
  page?: number; pageSize?: number; range?: string
  clientSlug?: string; sensorId?: string; onlyChains?: boolean
}, sensorIds?: string[]): Promise<PaginatedResponse<WebSession>> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize,
    range: params?.range, clientSlug: params?.clientSlug, sensorId: params?.sensorId,
  })
  if (params?.onlyChains) sp.set('onlyChains', 'true')
  return apiFetch(`${getApiUrl()}/web-hits/sessions?${sp}${sensorScopeParam(sensorIds)}`, 60)
}

export async function fetchWebSessionDetail(fingerprint: string, sensorIds?: string[]): Promise<{ fingerprint: string; hits: import("./types").WebHit[] }> {
  return apiFetch(`${getApiUrl()}/web-hits/sessions/${encodeURIComponent(fingerprint)}?_=1${sensorScopeParam(sensorIds)}`, 30)
}

export async function fetchWebHitsStats(params?: { range?: string; clientSlug?: string; sensorId?: string }, sensorIds?: string[]): Promise<{
  total: number
  byAttackType: { attackType: string; count: number }[]
  topIps: { srcIp: string; count: number }[]
}> {
  const sp = buildSearchParams({ range: params?.range, clientSlug: params?.clientSlug, sensorId: params?.sensorId })
  const qs = sp.toString()
  return apiFetch(`${getApiUrl()}/web-hits/stats?${qs}${sensorScopeParam(sensorIds)}`, 60)
}
