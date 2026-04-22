function getApiUrl() {
  // Server-side rendering inside Docker must talk to the service name,
  // while the browser must keep using the host-mapped public URL.
  return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  pagination: PaginationMeta
}

export interface SessionsSummary {
  total: number
  compromised: number
  blocked: number
  scanGroups: number
  bots: number
  humans: number
}

export interface PaginatedSessionsResponse extends PaginatedResponse<ApiSession> {
  summary: SessionsSummary
}

export interface TimelinePoint {
  bucketStart: string
  label: string
  sessions: number
  successfulLogins: number
}

export interface DashboardStats {
  totalSessions: number
  totalCommands: number
  uniqueIps: number
  successfulLogins: number
  failedLogins: number
  topCommands: { command: string; count: number }[]
  topUsernames: { username: string; count: number }[]
  topPasswords: { password: string; count: number }[]
  timeline: TimelinePoint[]
  eventsByHour?: { hour: string; count: number }[]
  eventsByDay?: { day: string; count: number }[]
}

export interface DashboardInsightsWindow {
  firstSeen: string | null
  lastSeen: string | null
  totalSessions: number
  uniqueIps: number
}

export interface DashboardInsightsFunnel {
  connections: number
  authAttempts: number
  loginSuccess: number
  commands: number
  highSignalCompromise: number
}

export interface DashboardCountrySuccessCandidate {
  srcIp: string
  sessions: number
  successes: number
}

export interface DashboardCredentialCampaign {
  bucketStart: string
  username: string | null
  password: string | null
  attempts: number
  successCount: number
  uniqueIps: number
  ips: string[]
}

export interface DashboardRecurringIp {
  srcIp: string
  totalSessions: number
  failedSessions: number
  successfulSessions: number
  credentialCount: number
  firstSeen: string
  lastSeen: string
  returnAfterMinutes: number | null
  clientVersion: string | null
}

export interface DashboardCommandPattern {
  sequence: string
  sessions: number
  uniqueIps: number
}

export interface DashboardDepthBucket {
  bucket: string
  sessions: number
}

export interface DashboardSuccessfulDepth {
  buckets: DashboardDepthBucket[]
  averageCommands: number
  maxCommands: number
  interactiveSessions: number
}

export interface DashboardInsights {
  window: DashboardInsightsWindow
  funnel: DashboardInsightsFunnel
  countrySuccessCandidates: DashboardCountrySuccessCandidate[]
  credentialCampaigns: DashboardCredentialCampaign[]
  recurringIps: DashboardRecurringIp[]
  commandPatterns: DashboardCommandPattern[]
  successfulDepth: DashboardSuccessfulDepth
}

export interface CredentialsSummary {
  totalAttempts: number
  successfulAttempts: number
  failedAttempts: number
  uniqueUsernames: number
  uniquePasswords: number
  uniqueCredentialPairs: number
  repeatedCredentialPairs: number
  sprayPasswords: number
  targetedUsernames: number
  successRate: number
}

export interface CredentialPairStat {
  username: string | null
  password: string | null
  attempts: number
  successCount: number
  failedCount: number
  uniqueIps: number
  firstSeen: string | null
  lastSeen: string | null
}

export interface UsernameCredentialStat {
  username: string | null
  attempts: number
  successCount: number
  failedCount: number
  uniqueIps: number
  passwordCount: number
}

export interface PasswordCredentialStat {
  password: string | null
  attempts: number
  successCount: number
  failedCount: number
  uniqueIps: number
  usernameCount: number
}

export interface SprayPasswordStat {
  password: string | null
  attempts: number
  successCount: number
  usernameCount: number
  ipCount: number
}

export interface TargetedUsernameStat {
  username: string | null
  attempts: number
  successCount: number
  passwordCount: number
  ipCount: number
}

export interface DiversifiedAttackerStat {
  srcIp: string
  attempts: number
  successCount: number
  credentialCount: number
  usernameCount: number
  passwordCount: number
  lastSeen: string | null
}

export interface CredentialsAnalytics {
  summary: CredentialsSummary
  sprayPasswords: SprayPasswordStat[]
  targetedUsernames: TargetedUsernameStat[]
  diversifiedAttackers: DiversifiedAttackerStat[]
  rankingsPage: CredentialsTablePage<CredentialPairStat | PasswordCredentialStat | UsernameCredentialStat>
  recentAttemptsPage: CredentialsTablePage<HoneypotEvent>
  current: {
    mainTab: CredentialsMainTab
    rankingType: CredentialsRankingType
    outcome: CredentialsOutcomeFilter
    frequency: CredentialsFrequencyFilter
    search: string
    sortBy: string
    sortDir: CredentialsSortDirection
  }
}

export type CredentialsMainTab = "rankings" | "patterns" | "recent"
export type CredentialsRankingType = "pairs" | "passwords" | "usernames"
export type CredentialsOutcomeFilter = "all" | "success" | "failed"
export type CredentialsFrequencyFilter = "all" | "reused" | "single"
export type CredentialsSortDirection = "asc" | "desc"

export interface CredentialsTablePage<T> extends PaginatedResponse<T> {
  sortBy: string
  sortDir: CredentialsSortDirection
}

export async function fetchEvents(params?: {
  page?: number
  pageSize?: number
  limit?: number
  offset?: number
  type?: string
  q?: string
  startDate?: string
  endDate?: string
}): Promise<HoneypotEvent[]> {
  const pageData = await fetchEventsPage(params)
  return pageData.items
}

export async function fetchEventsPage(params?: {
  page?: number
  pageSize?: number
  limit?: number
  offset?: number
  type?: string
  q?: string
  startDate?: string
  endDate?: string
}): Promise<PaginatedResponse<HoneypotEvent>> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set("page", String(params.page))
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize))
  if (params?.limit) searchParams.set("limit", String(params.limit))
  if (params?.offset) searchParams.set("offset", String(params.offset))
  if (params?.type) searchParams.set("type", params.type)
  if (params?.q) searchParams.set("q", params.q)
  if (params?.startDate) searchParams.set("startDate", params.startDate)
  if (params?.endDate) searchParams.set("endDate", params.endDate)

  const res = await fetch(`${getApiUrl()}/events?${searchParams}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`)
  return res.json()
}

export async function fetchSessions(params?: {
  page?: number
  pageSize?: number
  limit?: number
  offset?: number
  q?: string
  outcome?: "all" | "compromised" | "blocked"
  startDate?: string
  endDate?: string
}): Promise<ApiSession[]> {
  const pageData = await fetchSessionsPage(params)
  return pageData.items
}

export async function fetchSessionsPage(params?: {
  page?: number
  pageSize?: number
  limit?: number
  offset?: number
  q?: string
  outcome?: "all" | "compromised" | "blocked"
  actor?: "all" | "bot" | "human" | "unknown"
  startDate?: string
  endDate?: string
}): Promise<PaginatedSessionsResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set("page", String(params.page))
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize))
  if (params?.limit) searchParams.set("limit", String(params.limit))
  if (params?.offset) searchParams.set("offset", String(params.offset))
  if (params?.q) searchParams.set("q", params.q)
  if (params?.outcome) searchParams.set("outcome", params.outcome)
  if (params?.actor && params.actor !== "all") searchParams.set("actor", params.actor)
  if (params?.startDate) searchParams.set("startDate", params.startDate)
  if (params?.endDate) searchParams.set("endDate", params.endDate)

  const res = await fetch(`${getApiUrl()}/sessions?${searchParams}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`)
  return res.json()
}

export async function fetchSessionScanGroupsPage(params?: {
  page?: number
  pageSize?: number
  limit?: number
  offset?: number
  q?: string
  startDate?: string
  endDate?: string
}): Promise<PaginatedSessionsResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set("page", String(params.page))
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize))
  if (params?.limit) searchParams.set("limit", String(params.limit))
  if (params?.offset) searchParams.set("offset", String(params.offset))
  if (params?.q) searchParams.set("q", params.q)
  if (params?.startDate) searchParams.set("startDate", params.startDate)
  if (params?.endDate) searchParams.set("endDate", params.endDate)

  const res = await fetch(`${getApiUrl()}/sessions/scan-groups?${searchParams}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to fetch scan groups: ${res.status}`)
  return res.json()
}

export async function fetchOverviewStats(params: {
  startDate: string
  endDate: string
  range: "day" | "week" | "month"
  timezone?: string
}): Promise<DashboardStats> {
  const searchParams = new URLSearchParams()
  searchParams.set("startDate", params.startDate)
  searchParams.set("endDate", params.endDate)
  searchParams.set("range", params.range)
  if (params.timezone) searchParams.set("timezone", params.timezone)

  const res = await fetch(`${getApiUrl()}/stats/overview?${searchParams}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to fetch overview stats: ${res.status}`)
  return res.json()
}

export async function fetchGeoSummary(): Promise<{ srcIp: string; loginSuccess: boolean | null }[]> {
  const res = await fetch(`${getApiUrl()}/stats/geo`, { cache: "no-store" })
  if (!res.ok) return []
  return res.json()
}

export async function fetchDashboardInsights(): Promise<DashboardInsights> {
  const res = await fetch(`${getApiUrl()}/stats/dashboards`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to fetch dashboard insights: ${res.status}`)
  return res.json()
}

export async function fetchCredentialsAnalytics(params?: {
  limit?: number
  recentLimit?: number
  page?: number
  pageSize?: number
  mainTab?: CredentialsMainTab
  rankingType?: CredentialsRankingType
  outcome?: CredentialsOutcomeFilter
  frequency?: CredentialsFrequencyFilter
  search?: string
  sortBy?: string
  sortDir?: CredentialsSortDirection
  startDate?: string
  endDate?: string
}): Promise<CredentialsAnalytics> {
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set("limit", String(params.limit))
  if (params?.recentLimit) searchParams.set("recentLimit", String(params.recentLimit))
  if (params?.page) searchParams.set("page", String(params.page))
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize))
  if (params?.mainTab) searchParams.set("mainTab", params.mainTab)
  if (params?.rankingType) searchParams.set("rankingType", params.rankingType)
  if (params?.outcome) searchParams.set("outcome", params.outcome)
  if (params?.frequency) searchParams.set("frequency", params.frequency)
  if (params?.search) searchParams.set("search", params.search)
  if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
  if (params?.sortDir) searchParams.set("sortDir", params.sortDir)
  if (params?.startDate) searchParams.set("startDate", params.startDate)
  if (params?.endDate) searchParams.set("endDate", params.endDate)

  const res = await fetch(`${getApiUrl()}/stats/credentials?${searchParams}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to fetch credentials analytics: ${res.status}`)
  return res.json()
}

export async function fetchSessionCommands(): Promise<Record<string, string[]>> {
  const res = await fetch(`${getApiUrl()}/stats/session-commands?limit=5000`, {
    cache: "no-store",
  })
  if (!res.ok) return {}
  return res.json()
}

export async function fetchSession(id: string): Promise<ApiSessionDetail> {
  const res = await fetch(`${getApiUrl()}/sessions/${id}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`)
  return res.json()
}

export async function fetchWebHits(params?: {
  limit?: number
  offset?: number
  attackType?: string
  srcIp?: string
}): Promise<{ total: number; hits: WebHit[] }> {
  const searchParams = new URLSearchParams()
  if (params?.limit)      searchParams.set("limit",      String(params.limit))
  if (params?.offset)     searchParams.set("offset",     String(params.offset))
  if (params?.attackType) searchParams.set("attackType", params.attackType)
  if (params?.srcIp)      searchParams.set("srcIp",      params.srcIp)

  const res = await fetch(`${getApiUrl()}/web-hits?${searchParams}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`Failed to fetch web hits: ${res.status}`)
  return res.json()
}

export interface WebHitByIp {
  srcIp:       string
  totalHits:   number
  firstSeen:   string
  lastSeen:    string
  attackTypes: string[]
  topPaths:    string[]
  userAgents:  string[]
}

export async function fetchWebTimeline(): Promise<{
  days: ({ day: string } & Record<string, number>)[]
  attackTypes: string[]
}> {
  const res = await fetch(`${getApiUrl()}/web-hits/timeline`, { cache: 'no-store' })
  if (!res.ok) return { days: [], attackTypes: [] }
  return res.json()
}

export async function fetchWebPaths(): Promise<{
  paths: { path: string; total: number; byType: Record<string, number> }[]
}> {
  const res = await fetch(`${getApiUrl()}/web-hits/paths`, { cache: 'no-store' })
  if (!res.ok) return { paths: [] }
  return res.json()
}

export async function fetchWebHitsByIp(): Promise<WebHitByIp[]> {
  const pageData = await fetchWebHitsByIpPage({ pageSize: 1000 })
  return pageData.items
}

export async function fetchWebHitsByIpPage(params?: {
  page?: number
  pageSize?: number
  limit?: number
  offset?: number
  q?: string
}): Promise<PaginatedResponse<WebHitByIp>> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set("page", String(params.page))
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize))
  if (params?.limit) searchParams.set("limit", String(params.limit))
  if (params?.offset) searchParams.set("offset", String(params.offset))
  if (params?.q) searchParams.set("q", params.q)

  const res = await fetch(`${getApiUrl()}/web-hits/by-ip?${searchParams}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch web hits by IP: ${res.status}`)
  return res.json()
}

export async function fetchWebHitsStats(): Promise<{
  total: number
  byAttackType: { attackType: string; count: number }[]
  topIps: { srcIp: string; count: number }[]
}> {
  const res = await fetch(`${getApiUrl()}/web-hits/stats`, { cache: "no-store" })
  if (!res.ok) throw new Error(`Failed to fetch web hits stats: ${res.status}`)
  return res.json()
}

// --- Types matching the API response ---

export interface HoneypotEvent {
  id: string
  sessionId: string
  eventType: string
  eventTs: string
  srcIp: string
  message: string | null
  command: string | null
  username: string | null
  password: string | null
  success: boolean | null
  rawJson: Record<string, unknown>
  normalizedJson: Record<string, unknown>
  createdAt: string
  cowrieEventId: string
  cowrieTs: string
}

export interface ApiSession {
  id: string
  cowrieSessionId: string
  srcIp: string
  protocol: string
  username: string | null
  password: string | null
  loginSuccess: boolean | null
  hassh: string | null
  clientVersion: string | null
  startedAt: string
  endedAt: string | null
  sessionType: 'bot' | 'human' | 'unknown'
  threatTags: string[]
  createdAt: string
  updatedAt: string
  eventCount: number
  authAttemptCount: number
  commandCount: number
  durationSec: number | null
  _count: { events: number }
}

export interface ApiSessionDetail extends Omit<ApiSession, "_count"> {
  events: HoneypotEvent[]
}

export interface WebHit {
  id:         string
  srcIp:      string
  method:     string
  path:       string
  query:      string
  userAgent:  string
  attackType: string
  timestamp:  string
}

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

export interface ThreatsSummary {
  total: number
  critical: number
  high: number
  crossProtocol: number
}

export interface PaginatedThreatsResponse extends PaginatedResponse<ThreatSummary> {
  summary: ThreatsSummary
}

export interface ThreatSummary {
  ip:           string
  score:        number
  level:        RiskLevel
  crossProtocol: boolean
  topFactors:   string[]
  breakdown:    { ssh: number; web: number; commands: number; crossProto: number }
  commandCategories: Record<string, number>
  ssh: { sessions: number; authAttempts: number; loginSuccess: boolean; commandCount: number } | null
  web: { hits: number; attackTypes: string[] } | null
}

export interface ThreatDetail {
  ip:           string
  crossProtocol: boolean
  ssh: { sessions: number; authAttempts: number; loginSuccess: boolean } | null
  web: { hits: number; attackTypes: string[] } | null
  risk: {
    score:      number
    level:      RiskLevel
    breakdown:  { ssh: number; web: number; commands: number; crossProto: number }
    topFactors: string[]
    commandCategories: Record<string, string[]>
  }
  classifiedCommands: {
    command:  string
    ts:       string
    category: string
  }[]
}

export async function fetchThreats(): Promise<ThreatSummary[]> {
  const pageData = await fetchThreatsPage({ pageSize: 1000 })
  return pageData.items
}

export async function fetchThreatsPage(params?: {
  page?: number
  pageSize?: number
  limit?: number
  offset?: number
  q?: string
  level?: RiskLevel
  crossProtocol?: boolean
}): Promise<PaginatedThreatsResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set("page", String(params.page))
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize))
  if (params?.limit) searchParams.set("limit", String(params.limit))
  if (params?.offset) searchParams.set("offset", String(params.offset))
  if (params?.q) searchParams.set("q", params.q)
  if (params?.level) searchParams.set("level", params.level)
  if (params?.crossProtocol !== undefined) searchParams.set("crossProtocol", String(params.crossProtocol))

  const res = await fetch(`${getApiUrl()}/threats?${searchParams}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch threats: ${res.status}`)
  return res.json()
}

export async function fetchThreat(ip: string): Promise<ThreatDetail> {
  const res = await fetch(`${getApiUrl()}/threats/${encodeURIComponent(ip)}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch threat: ${res.status}`)
  return res.json()
}
