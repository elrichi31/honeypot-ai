import { getApiUrl, apiFetch, buildSearchParams } from "./client"

export interface C2IndicatorWithSrc {
  value: string
  type: "url" | "ip"
  host: string
  port?: number
  srcIp: string
  firstSeen: string
}

export interface PlantedSshKeyWithSrc {
  algorithm: string
  comment: string | null
  fingerprint: string
  raw: string
  srcIp: string
  firstSeen: string
}

export interface AggregatedIocsResponse {
  c2: C2IndicatorWithSrc[]
  sshKeys: PlantedSshKeyWithSrc[]
}

export async function fetchAggregatedIocs(params?: {
  period?: "24h" | "7d" | "30d" | "90d"
}): Promise<AggregatedIocsResponse> {
  const sp = buildSearchParams({ period: params?.period })
  // Global command scan + regex extraction; give it room like /threats.
  return apiFetch(`${getApiUrl()}/iocs?${sp}`, 60, 30000)
}
