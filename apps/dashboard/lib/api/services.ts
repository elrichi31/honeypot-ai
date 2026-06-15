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
  // SMB-specific
  topDomains?: { domain: string; count: number }[]
  topShares?: { share: string; count: number }[]
  topNativeOS?: { nativeOS: string; count: number }[]
  topNtlmHashes?: { ntlmHash: string; username: string; count: number }[]
}

export interface Sensor {
  sensorId: string
  clientId: string | null
  clientName: string | null
  clientSlug: string | null
  clientCode: string
  name: string
  protocol: string
  ip: string
  version: string
  ports: number[]
  probeHost: string
  lastSeen: string
  createdAt: string
  eventsTotal: number
  online: boolean
  degraded: boolean
  portStatus: Record<number, boolean>
}

export interface Client {
  id: string
  name: string
  slug: string
  code: string
  description: string
  forwardUrl: string
  createdAt: string
}

export async function fetchProtocolStats(): Promise<ProtocolStat[]> {
  return apiFetch<ProtocolStat[]>(`${getApiUrl()}/protocol-hits/stats`, 300)
}

export async function fetchTargetPortStats(): Promise<TargetPortStat[]> {
  return apiFetch<TargetPortStat[]>(`${getApiUrl()}/protocol-hits/ports/stats`, 300)
}

export async function fetchProtocolInsights(protocol: string): Promise<ProtocolInsights> {
  const url = new URL(`${getApiUrl()}/protocol-hits/insights`)
  url.searchParams.set('protocol', protocol)
  return apiFetch<ProtocolInsights>(url.toString(), 300)
}

export async function fetchSensors(): Promise<Sensor[]> {
  return apiFetch<Sensor[]>(`${getApiUrl()}/sensors`, 30)
}

export async function fetchClients(): Promise<Client[]> {
  return apiFetch<Client[]>(`${getApiUrl()}/clients`, 60)
}

export async function fetchProtocolHits(
  params: { page?: number; limit?: number; protocol?: string } = {}
): Promise<ProtocolHitsResponse> {
  const url = new URL(`${getApiUrl()}/protocol-hits`)
  if (params.page) url.searchParams.set('page', String(params.page))
  if (params.limit) url.searchParams.set('limit', String(params.limit))
  if (params.protocol) url.searchParams.set('protocol', params.protocol)
  return apiFetch<ProtocolHitsResponse>(url.toString(), 30)
}
