const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function fetchEvents(params?: {
  limit?: number
  offset?: number
  type?: string
}): Promise<HoneypotEvent[]> {
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set("limit", String(params.limit))
  if (params?.offset) searchParams.set("offset", String(params.offset))
  if (params?.type) searchParams.set("type", params.type)

  const res = await fetch(`${API_URL}/events?${searchParams}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`)
  return res.json()
}

export async function fetchSessions(params?: {
  limit?: number
  offset?: number
}): Promise<ApiSession[]> {
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set("limit", String(params.limit))
  if (params?.offset) searchParams.set("offset", String(params.offset))

  const res = await fetch(`${API_URL}/sessions?${searchParams}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`)
  return res.json()
}

export async function fetchSession(id: string): Promise<ApiSessionDetail> {
  const res = await fetch(`${API_URL}/sessions/${id}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`)
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
