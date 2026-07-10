import { getApiUrl, apiFetch, buildSearchParams } from "./client"
import type {
  CredentialsAnalytics, CredentialsMainTab, CredentialsRankingType,
  CredentialsOutcomeFilter, CredentialsFrequencyFilter, CredentialsSortDirection,
} from "./types"

export async function fetchCredentialsAnalytics(params?: {
  limit?: number; recentLimit?: number; page?: number; pageSize?: number
  mainTab?: CredentialsMainTab; rankingType?: CredentialsRankingType
  outcome?: CredentialsOutcomeFilter; frequency?: CredentialsFrequencyFilter
  search?: string; sortBy?: string; sortDir?: CredentialsSortDirection
  startDate?: string; endDate?: string
  clientSlug?: string; sensorId?: string; protocol?: string
}): Promise<CredentialsAnalytics> {
  const sp = buildSearchParams({
    limit: params?.limit, recentLimit: params?.recentLimit,
    page: params?.page, pageSize: params?.pageSize,
    mainTab: params?.mainTab, rankingType: params?.rankingType,
    outcome: params?.outcome, frequency: params?.frequency,
    search: params?.search, sortBy: params?.sortBy, sortDir: params?.sortDir,
    startDate: params?.startDate, endDate: params?.endDate,
    clientSlug: params?.clientSlug, sensorId: params?.sensorId, protocol: params?.protocol,
  })
  return apiFetch(`${getApiUrl()}/stats/credentials?${sp}`, 60, 30000)
}

export async function fetchCredentialsAnalyticsClient(params?: Parameters<typeof fetchCredentialsAnalytics>[0]): Promise<CredentialsAnalytics> {
  const sp = buildSearchParams({
    limit: params?.limit, recentLimit: params?.recentLimit,
    page: params?.page, pageSize: params?.pageSize,
    mainTab: params?.mainTab, rankingType: params?.rankingType,
    outcome: params?.outcome, frequency: params?.frequency,
    search: params?.search, sortBy: params?.sortBy, sortDir: params?.sortDir,
    startDate: params?.startDate, endDate: params?.endDate,
    clientSlug: params?.clientSlug, sensorId: params?.sensorId, protocol: params?.protocol,
  })
  const res = await fetch(`/api/credentials?${sp}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Credentials request failed (${res.status})`)
  return res.json()
}
