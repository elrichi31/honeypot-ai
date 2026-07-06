import { apiFetch, getApiUrl, buildSearchParams } from "./client"

export type DeceptionOverview = {
  nodesTotal: number
  nodesOnline: number
  hits24h: number
  hits7d: number
  authAttempts24h: number
  uniqueInternalIps: number
  lastEvent: string | null
}

export type DeceptionNode = {
  sensorId: string
  name: string
  ip: string
  ports: number[]
  online: boolean
  lastSeen: string
  realProtocol: string | null
  hits: number
  authAttempts: number
  lastHit: string | null
}

export type KillChainStep = {
  nodeId: string | null
  nodeName: string | null
  protocol: string
  dstPort: number
  eventType: string
  username: string | null
  password: string | null
  timestamp: string
  logdata: Record<string, unknown> | null
  clientId: string | null
  clientSlug: string | null
  clientName: string | null
}

export type KillChain = {
  key: string
  publicIp: string | null
  sessionId: string | null
  correlation: "probable" | "none"
  firstSeen: string
  lastSeen: string
  steps: KillChainStep[]
  nodesTouched: number
  durationSec: number
}

export type DeceptionEvent = {
  id: string
  node_id: string | null
  node_name: string | null
  protocol: string
  src_ip: string
  src_port: number | null
  dst_port: number
  event_type: string
  username: string | null
  password: string | null
  timestamp: string
  logtype: number | null
  logdata: Record<string, unknown> | null
  dst_host: string | null
  client_id: string | null
  client_slug: string | null
  client_name: string | null
}

export type DeceptionEventsResponse = {
  data: DeceptionEvent[]
  meta: { page: number; limit: number; total: number }
}

export type DeceptionPortscan = {
  id: string
  sensor_id: string
  timestamp: string
  src_ip: string
  dst_ports: number[]
  node_id: string | null
  scan_type: string
  client_id: string | null
  client_slug: string | null
  client_name: string | null
}

export type DeceptionPortscansResponse = {
  data: DeceptionPortscan[]
  meta: { page: number; limit: number; total: number }
}

export function fetchDeceptionOverview(): Promise<DeceptionOverview> {
  return apiFetch(`${getApiUrl()}/deception/overview`, 30)
}

export function fetchDeceptionNodes(): Promise<DeceptionNode[]> {
  return apiFetch(`${getApiUrl()}/deception/nodes`, 30)
}

export function fetchDeceptionKillchain(limit = 200): Promise<KillChain[]> {
  return apiFetch(`${getApiUrl()}/deception/killchain?limit=${limit}`, 30)
}

export function fetchDeceptionEvents(params: { page?: number; limit?: number; nodeId?: string } = {}): Promise<DeceptionEventsResponse> {
  const sp = buildSearchParams(params)
  return apiFetch(`${getApiUrl()}/deception/events?${sp}`, 30)
}

// ── Per-client (scoped to one client's deception network) ────────────────────

export function fetchClientDeceptionOverview(clientSlug: string): Promise<DeceptionOverview> {
  return apiFetch(`${getApiUrl()}/clients/${encodeURIComponent(clientSlug)}/deception/overview`, 30)
}

export function fetchClientDeceptionNodes(clientSlug: string): Promise<DeceptionNode[]> {
  return apiFetch(`${getApiUrl()}/clients/${encodeURIComponent(clientSlug)}/deception/nodes`, 30)
}

export function fetchClientDeceptionKillchain(clientSlug: string, limit = 200): Promise<KillChain[]> {
  return apiFetch(`${getApiUrl()}/clients/${encodeURIComponent(clientSlug)}/deception/killchain?limit=${limit}`, 30)
}

export function fetchClientDeceptionEvents(
  clientSlug: string,
  params: { page?: number; limit?: number; nodeId?: string } = {},
): Promise<DeceptionEventsResponse> {
  const sp = buildSearchParams(params)
  return apiFetch(`${getApiUrl()}/clients/${encodeURIComponent(clientSlug)}/deception/events?${sp}`, 30)
}

export function fetchDeceptionPortscans(params: { page?: number; limit?: number; nodeId?: string } = {}): Promise<DeceptionPortscansResponse> {
  const sp = buildSearchParams(params)
  return apiFetch(`${getApiUrl()}/deception/portscans?${sp}`, 30)
}

export function fetchClientDeceptionPortscans(
  clientSlug: string,
  params: { page?: number; limit?: number; nodeId?: string } = {},
): Promise<DeceptionPortscansResponse> {
  const sp = buildSearchParams(params)
  return apiFetch(`${getApiUrl()}/clients/${encodeURIComponent(clientSlug)}/deception/portscans?${sp}`, 30)
}
