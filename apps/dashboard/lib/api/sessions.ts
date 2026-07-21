import { getApiUrl, apiFetch, buildSearchParams } from "./client"
import { sensorScopeParam } from "./stats"
import type { HoneypotEvent, ApiSession, ApiSessionDetail, PaginatedResponse, PaginatedSessionsResponse } from "./types"

export async function fetchEventsPage(params?: {
  page?: number; pageSize?: number; limit?: number; offset?: number
  type?: string; q?: string; startDate?: string; endDate?: string
}, sensorIds?: string[]): Promise<PaginatedResponse<HoneypotEvent>> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize, limit: params?.limit,
    offset: params?.offset, type: params?.type, q: params?.q,
    startDate: params?.startDate, endDate: params?.endDate,
  })
  return apiFetch(`${getApiUrl()}/events?${sp}${sensorScopeParam(sensorIds)}`)
}

export async function fetchEvents(params?: Parameters<typeof fetchEventsPage>[0]): Promise<HoneypotEvent[]> {
  return (await fetchEventsPage(params)).items
}

export async function fetchSessionsPage(params?: {
  page?: number; pageSize?: number; limit?: number; offset?: number
  q?: string; outcome?: "all" | "compromised" | "blocked"
  actor?: "all" | "bot" | "human" | "unknown"; startDate?: string; endDate?: string
  sortDir?: 'asc' | 'desc'
  clientSlug?: string; sensorId?: string
}, sensorIds?: string[]): Promise<PaginatedSessionsResponse> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize, limit: params?.limit,
    offset: params?.offset, q: params?.q, outcome: params?.outcome,
    startDate: params?.startDate, endDate: params?.endDate,
    clientSlug: params?.clientSlug, sensorId: params?.sensorId,
  })
  if (params?.actor && params.actor !== "all") sp.set("actor", params.actor)
  if (params?.sortDir) sp.set("sortDir", params.sortDir)
  return apiFetch(`${getApiUrl()}/sessions?${sp}${sensorScopeParam(sensorIds)}`, 30)
}

export async function fetchSessions(params?: Parameters<typeof fetchSessionsPage>[0], sensorIds?: string[]): Promise<ApiSession[]> {
  return (await fetchSessionsPage(params, sensorIds)).items
}

export async function fetchSessionScanGroupsPage(params?: {
  page?: number; pageSize?: number; limit?: number; offset?: number
  q?: string; startDate?: string; endDate?: string
  clientSlug?: string; sensorId?: string
}, sensorIds?: string[]): Promise<PaginatedSessionsResponse> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize, limit: params?.limit,
    offset: params?.offset, q: params?.q,
    startDate: params?.startDate, endDate: params?.endDate,
    clientSlug: params?.clientSlug, sensorId: params?.sensorId,
  })
  return apiFetch(`${getApiUrl()}/sessions/scan-groups?${sp}${sensorScopeParam(sensorIds)}`, 30)
}

export async function fetchSession(id: string, sensorIds?: string[]): Promise<ApiSessionDetail> {
  return apiFetch(`${getApiUrl()}/sessions/${id}?_=1${sensorScopeParam(sensorIds)}`)
}
