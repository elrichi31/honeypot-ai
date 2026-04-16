function getApiUrl() {
  // Server-side rendering inside Docker must talk to the service name,
  // while the browser must keep using the host-mapped public URL.
  return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
}

export async function fetchEvents(params?: {
  limit?: number
  offset?: number
  type?: string
  startDate?: string
  endDate?: string
}): Promise<HoneypotEvent[]> {
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set("limit", String(params.limit))
  if (params?.offset) searchParams.set("offset", String(params.offset))
  if (params?.type) searchParams.set("type", params.type)
  if (params?.startDate) searchParams.set("startDate", params.startDate)
  if (params?.endDate) searchParams.set("endDate", params.endDate)

  const res = await fetch(`${getApiUrl()}/events?${searchParams}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`)
  return res.json()
}

export async function fetchSessions(params?: {
  limit?: number
  offset?: number
  startDate?: string
  endDate?: string
}): Promise<ApiSession[]> {
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set("limit", String(params.limit))
  if (params?.offset) searchParams.set("offset", String(params.offset))
  if (params?.startDate) searchParams.set("startDate", params.startDate)
  if (params?.endDate) searchParams.set("endDate", params.endDate)

  const res = await fetch(`${getApiUrl()}/sessions?${searchParams}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`)
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
  const res = await fetch(`${getApiUrl()}/web-hits/by-ip`, { cache: 'no-store' })
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
  createdAt: string
  updatedAt: string
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
  const res = await fetch(`${getApiUrl()}/threats`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch threats: ${res.status}`)
  return res.json()
}

export async function fetchThreat(ip: string): Promise<ThreatDetail> {
  const res = await fetch(`${getApiUrl()}/threats/${encodeURIComponent(ip)}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch threat: ${res.status}`)
  return res.json()
}
