import { apiFetch, getApiUrl } from './client'

export interface ProtocolHit {
  id: string
  protocol: string
  src_ip: string
  src_port: number | null
  dst_port: number
  event_type: string
  username: string | null
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

export async function fetchProtocolStats(): Promise<ProtocolStat[]> {
  return apiFetch<ProtocolStat[]>(`${getApiUrl()}/protocol-hits/stats`)
}

export async function fetchTargetPortStats(): Promise<TargetPortStat[]> {
  return apiFetch<TargetPortStat[]>(`${getApiUrl()}/protocol-hits/ports/stats`)
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
