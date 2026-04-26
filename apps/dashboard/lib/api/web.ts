import { getApiUrl, apiFetch, buildSearchParams } from "./client"
import type { WebHit, WebHitByIp, PaginatedResponse } from "./types"

export async function fetchWebHits(params?: {
  limit?: number; offset?: number; attackType?: string; srcIp?: string
}): Promise<{ total: number; hits: WebHit[] }> {
  const sp = buildSearchParams({
    limit: params?.limit, offset: params?.offset,
    attackType: params?.attackType, srcIp: params?.srcIp,
  })
  return apiFetch(`${getApiUrl()}/web-hits?${sp}`)
}

export async function fetchWebTimeline(): Promise<{
  days: ({ day: string } & Record<string, number>)[]; attackTypes: string[]
}> {
  const res = await fetch(`${getApiUrl()}/web-hits/timeline`, { cache: "no-store" })
  if (!res.ok) return { days: [], attackTypes: [] }
  return res.json()
}

export async function fetchWebPaths(): Promise<{
  paths: { path: string; total: number; byType: Record<string, number> }[]
}> {
  const res = await fetch(`${getApiUrl()}/web-hits/paths`, { cache: "no-store" })
  if (!res.ok) return { paths: [] }
  return res.json()
}

export async function fetchWebHitsByIpPage(params?: {
  page?: number; pageSize?: number; limit?: number; offset?: number; q?: string
}): Promise<PaginatedResponse<WebHitByIp>> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize,
    limit: params?.limit, offset: params?.offset, q: params?.q,
  })
  return apiFetch(`${getApiUrl()}/web-hits/by-ip?${sp}`)
}

export async function fetchWebHitsByIp(params?: Parameters<typeof fetchWebHitsByIpPage>[0]): Promise<WebHitByIp[]> {
  return (await fetchWebHitsByIpPage({ pageSize: 1000, ...params })).items
}

export async function fetchWebHitsStats(): Promise<{
  total: number
  byAttackType: { attackType: string; count: number }[]
  topIps: { srcIp: string; count: number }[]
}> {
  return apiFetch(`${getApiUrl()}/web-hits/stats`)
}
