export interface SpectraThreat {
  threat_name?: string | null
  malware_family?: string | null
  malware_type?: string | null
  classification?: string | null
  risk_score?: number | null
  sample_type?: string | null
}

export interface SpectraAnalyzeIpReport {
  requested_ip: string
  modified_time?: string | null
  third_party_reputations?: {
    statistics?: {
      total?: number
      malicious?: number
      undetected?: number
      clean?: number
    } | null
    sources?: Array<{
      source?: string | null
      detection?: string | null
      category?: string | null
      update_time?: string | null
      detect_time?: string | null
    }> | null
  } | null
  downloaded_files_statistics?: {
    total?: number
    unknown?: number
    suspicious?: number
    malicious?: number
    goodware?: number
  } | null
  top_threats?: SpectraThreat[] | null
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "")
}

export async function fetchSpectraAnalyzeIpReport(
  ip: string,
  baseUrl: string,
  token: string,
): Promise<SpectraAnalyzeIpReport | null> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  try {
    const res = await fetch(
      `${normalizedBaseUrl}/api/network-threat-intel/ip/${encodeURIComponent(ip)}/report/`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Token ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      },
    )

    if (!res.ok) return null
    return await res.json() as SpectraAnalyzeIpReport
  } catch {
    return null
  }
}
