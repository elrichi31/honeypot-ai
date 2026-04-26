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
}): Promise<CredentialsAnalytics> {
  const sp = buildSearchParams({
    limit: params?.limit, recentLimit: params?.recentLimit,
    page: params?.page, pageSize: params?.pageSize,
    mainTab: params?.mainTab, rankingType: params?.rankingType,
    outcome: params?.outcome, frequency: params?.frequency,
    search: params?.search, sortBy: params?.sortBy, sortDir: params?.sortDir,
    startDate: params?.startDate, endDate: params?.endDate,
  })
  return apiFetch(`${getApiUrl()}/stats/credentials?${sp}`)
}
