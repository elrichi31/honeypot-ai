import { apiFetch, getApiUrl } from './client'

export interface ProtocolHit {
  id: string
  protocol: string
  src_ip: string
  src_port: number | null
  dst_port: number
  event_type: string
  username: string | null
  password: string | null
  data: Record<string, unknown>
  timestamp: string
}

export interface ProtocolStat {
  protocol: string
  count: number
  lastSeen: string
  authAttempts: number
}

export interface TargetPortStat {
  protocol: string
  dstPort: number
  count: number
  lastSeen: string
  authAttempts: number
}

export interface ProtocolHitsResponse {
  data: ProtocolHit[]
  meta: { page: number; limit: number; total: number }
}

export interface ProtocolInsights {
  totals: {
    total: number
    uniqueIps: number
    authAttempts: number
    commandEvents: number
    lastSeen: string | null
  }
  topIps: { srcIp: string; count: number; lastSeen: string }[]
  topPorts: { dstPort: number; count: number; lastSeen: string }[]
  topUsernames: { username: string; count: number }[]
  topPasswords: { password: string; count: number }[]
  topCommands: { command: string; count: number }[]
  topServices: { service: string; count: number }[]
  topDatabases: { database: string; count: number }[]
}

export interface Sensor {
  sensorId: string
  name: string
  protocol: string
  ip: string
  version: string
  lastSeen: string
  createdAt: string
  eventsTotal: number
  online: boolean
}

export async function fetchProtocolStats(): Promise<ProtocolStat[]> {
  return apiFetch<ProtocolStat[]>(`${getApiUrl()}/protocol-hits/stats`)
}

export async function fetchTargetPortStats(): Promise<TargetPortStat[]> {
  return apiFetch<TargetPortStat[]>(`${getApiUrl()}/protocol-hits/ports/stats`)
}

export async function fetchProtocolInsights(protocol: string): Promise<ProtocolInsights> {
  const url = new URL(`${getApiUrl()}/protocol-hits/insights`)
  url.searchParams.set('protocol', protocol)
  return apiFetch<ProtocolInsights>(url.toString())
}

export async function fetchSensors(): Promise<Sensor[]> {
  return apiFetch<Sensor[]>(`${getApiUrl()}/sensors`)
}

export async function fetchProtocolHits(
  params: { page?: number; limit?: number; protocol?: string } = {}
): Promise<ProtocolHitsResponse> {
  const url = new URL(`${getApiUrl()}/protocol-hits`)
  if (params.page) url.searchParams.set('page', String(params.page))
  if (params.limit) url.searchParams.set('limit', String(params.limit))
  if (params.protocol) url.searchParams.set('protocol', params.protocol)
  return apiFetch<ProtocolHitsResponse>(url.toString())
}
