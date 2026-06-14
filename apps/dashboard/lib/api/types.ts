export interface CrossSensorTimeline {
  buckets: Array<Record<string, number | string>>
  activeProtocols: string[]
}

export interface HoneypotOverview {
  ssh: {
    sessions: number
    uniqueIps: number
    successfulLogins: number
    lastSeen: string | null
  }
  web: {
    hits: number
    uniqueIps: number
    topAttackType: string | null
    lastSeen: string | null
  }
  protocols: Array<{
    protocol: string
    count: number
    uniqueIps: number
    authAttempts: number
    lastSeen: string | null
  }>
  totals: {
    events: number
    activeSources: number
  }
}

export interface MetricTrend {
  current: number
  previous: number
  deltaPct: number | null
  spark: number[]
}

export interface KpiTrends {
  events: MetricTrend
  sshSessions: MetricTrend
  webHits: MetricTrend
  uniqueIps: MetricTrend
}

export interface MitreMatrix {
  tactics: Array<{
    tactic: string
    techniques: Array<{ id: string; name: string; count: number }>
  }>
  total: number
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

export type CredentialsMainTab = "rankings" | "patterns" | "recent"
export type CredentialsRankingType = "pairs" | "passwords" | "usernames"
export type CredentialsOutcomeFilter = "all" | "success" | "failed"
export type CredentialsFrequencyFilter = "all" | "reused" | "single"
export type CredentialsSortDirection = "asc" | "desc"

export interface CredentialsTablePage<T> extends PaginatedResponse<T> {
  sortBy: string
  sortDir: CredentialsSortDirection
}

export interface CredentialsAnalytics {
  summary: CredentialsSummary
  sprayPasswords: SprayPasswordStat[]
  targetedUsernames: TargetedUsernameStat[]
  diversifiedAttackers: DiversifiedAttackerStat[]
  rankingsPage: CredentialsTablePage<CredentialPairStat | PasswordCredentialStat | UsernameCredentialStat>
  recentAttemptsPage: CredentialsTablePage<CredentialAttempt>
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

// A single credential attempt in the Credentials "Recent" tab. Sourced from the
// unified credential_attempts view (SSH + protocol honeypots), so it carries
// `protocol` and only the fields that view exposes.
export interface CredentialAttempt {
  srcIp: string
  username: string | null
  password: string | null
  success: boolean | null
  eventTs: string
  protocol: string
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
  canaryTriggered?: boolean
  body?:      string
  headers?:   Record<string, string> | null
  timestamp:  string
  galahResult?: string | null
  galahErrorType?: string | null
  // Session context
  sessionHits?:       number
  sessionElapsedS?:   number
  pathsVisited?:      string[]
  attackChain?:       string[]
  isChainAttack?:     boolean
  clientFingerprint?: string
  canaryTokenType?:   string
  referer?:           string
  httpVersion?:       string
}

export interface WebSession {
  clientFingerprint: string
  srcIps:      string[]
  totalHits:   number
  firstSeen:   string
  lastSeen:    string
  chainHits:   number
  canaryHits:  number
  attackTypes: string[]
  topPaths:    string[]
  isMultiIp:   boolean
}

export interface WebHitByIp {
  srcIp:       string
  totalHits:   number
  firstSeen:   string
  lastSeen:    string
  attackTypes: string[]
  topPaths:    string[]
  userAgents:  string[]
  canaryHits?: number
  sensorIds?:   string[]
  sensorNames?: string[]
  clientNames?: string[]
}

export interface WebBurst {
  srcIp:           string
  startedAt:       string
  endedAt:         string
  hits:            number
  durationSec:     number
  intensityPerMin: number
  attackTypes:     string[]
  topPaths:        string[]
  canaryHits:      number
}

export interface WebHourlyCell {
  day:   string
  hour:  number
  count: number
}

export interface NoveltyStats {
  windowHours: number
  newIps: number
  newCredPairs: number
  newWebPaths: number
  newCommands: number
  topNewIps: { srcIp: string; hits: number }[]
}

export interface AttackerIntel {
  total: number
  enriched: number
  unenriched: number
  hostingTypes: {
    hosting: number
    vpn: number
    tor: number
    proxy: number
    residential: number
  }
  topAsns: { asn: string; org: string; count: number }[]
}

export interface BotRatio {
  bot: number
  human: number
  unknown: number
  total: number
  botPct: number | null
  humanPct: number | null
  unknownPct: number | null
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
  protocolsSeen: string[]
  crossProtocol: boolean
  topFactors:   string[]
  breakdown:    { ssh: number; web: number; protocols: number; commands: number; crossProto: number }
  commandCategories: Record<string, number>
  ssh: { sessions: number; authAttempts: number; loginSuccess: boolean; commandCount: number } | null
  web: { hits: number; attackTypes: string[] } | null
  protocols: {
    names: string[]
    totalHits: number
    authAttempts: number
    commandEvents: number
    connectEvents: number
    uniquePorts: number
    credentialReuse: boolean
    byService: Record<string, {
      hits: number
      authAttempts: number
      commandEvents: number
      connectEvents: number
      ports: number[]
    }>
    usernames: string[]
    passwords: string[]
  } | null
}

export interface ThreatDetail {
  ip:           string
  protocolsSeen: string[]
  crossProtocol: boolean
  ssh: { sessions: number; authAttempts: number; loginSuccess: boolean } | null
  web: { hits: number; attackTypes: string[] } | null
  protocols: {
    names: string[]
    totalHits: number
    authAttempts: number
    commandEvents: number
    connectEvents: number
    uniquePorts: number
    credentialReuse: boolean
    byService: Record<string, {
      hits: number
      authAttempts: number
      commandEvents: number
      connectEvents: number
      ports: number[]
    }>
    usernames: string[]
    passwords: string[]
  } | null
  portScans: { events: number; uniquePorts: number; ports: number[] } | null
  risk: {
    score:      number
    level:      RiskLevel
    breakdown:  { ssh: number; web: number; protocols: number; commands: number; crossProto: number }
    topFactors: string[]
    commandCategories: Record<string, string[]>
  }
  classifiedCommands: {
    command:  string
    ts:       string
    category: string
  }[]
}
