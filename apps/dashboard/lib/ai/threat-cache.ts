import { db } from "@/lib/db"
import type { IpEnrichment } from "@/lib/ip-enrichment"
import type { ThreatAnalysis } from "@/app/api/ai/threat-analysis/route"

export async function readEnrichmentCache(ip: string): Promise<IpEnrichment | null> {
  try {
    const { rows } = await db.query(
      `SELECT abuseipdb_data, ipinfo_data, spectra_analyze_data, virustotal_data, cached_at FROM ip_enrichment_cache WHERE ip = $1`,
      [ip],
    )
    const row = rows[0]
    if (!row || (!row.abuseipdb_data && !row.ipinfo_data && !row.spectra_analyze_data && !row.virustotal_data)) return null
    return {
      ip,
      abuseipdb: row.abuseipdb_data,
      ipinfo: row.ipinfo_data,
      spectraAnalyze: row.spectra_analyze_data,
      virustotal: row.virustotal_data ?? null,
      cachedAt: row.cached_at.toISOString(),
    }
  } catch { return null }
}

export async function readAiThreatCache(ip: string): Promise<ThreatAnalysis | null> {
  try {
    const { rows } = await db.query(
      `SELECT analysis, analyzed_at FROM ai_threat_cache WHERE ip = $1`,
      [ip],
    )
    if (!rows[0]) return null
    return {
      webFindings: "",
      iocs: [],
      sources: [],
      ...rows[0].analysis,
      analyzedAt: rows[0].analyzed_at.toISOString(),
    } as ThreatAnalysis
  } catch { return null }
}
