import { getApiUrl, apiFetch, buildSearchParams } from "./client"
import type { HoneypotEvent, ApiSession, ApiSessionDetail, PaginatedResponse, PaginatedSessionsResponse } from "./types"

export async function fetchEventsPage(params?: {
  page?: number; pageSize?: number; limit?: number; offset?: number
  type?: string; q?: string; startDate?: string; endDate?: string
}): Promise<PaginatedResponse<HoneypotEvent>> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize, limit: params?.limit,
    offset: params?.offset, type: params?.type, q: params?.q,
    startDate: params?.startDate, endDate: params?.endDate,
  })
  return apiFetch(`${getApiUrl()}/events?${sp}`)
}

export async function fetchEvents(params?: Parameters<typeof fetchEventsPage>[0]): Promise<HoneypotEvent[]> {
  return (await fetchEventsPage(params)).items
}

export async function fetchSessionsPage(params?: {
  page?: number; pageSize?: number; limit?: number; offset?: number
  q?: string; outcome?: "all" | "compromised" | "blocked"
  actor?: "all" | "bot" | "human" | "unknown"; startDate?: string; endDate?: string
}): Promise<PaginatedSessionsResponse> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize, limit: params?.limit,
    offset: params?.offset, q: params?.q, outcome: params?.outcome,
    startDate: params?.startDate, endDate: params?.endDate,
  })
  if (params?.actor && params.actor !== "all") sp.set("actor", params.actor)
  return apiFetch(`${getApiUrl()}/sessions?${sp}`)
}

export async function fetchSessions(params?: Parameters<typeof fetchSessionsPage>[0]): Promise<ApiSession[]> {
  return (await fetchSessionsPage(params)).items
}

export async function fetchSessionScanGroupsPage(params?: {
  page?: number; pageSize?: number; limit?: number; offset?: number
  q?: string; startDate?: string; endDate?: string
}): Promise<PaginatedSessionsResponse> {
  const sp = buildSearchParams({
    page: params?.page, pageSize: params?.pageSize, limit: params?.limit,
    offset: params?.offset, q: params?.q,
    startDate: params?.startDate, endDate: params?.endDate,
  })
  return apiFetch(`${getApiUrl()}/sessions/scan-groups?${sp}`)
}

export async function fetchSession(id: string): Promise<ApiSessionDetail> {
  return apiFetch(`${getApiUrl()}/sessions/${id}`)
}
