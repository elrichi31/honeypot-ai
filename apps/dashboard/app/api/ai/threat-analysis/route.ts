import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { db } from "@/lib/db"
import { getOpenAiKey } from "@/lib/server-config"
import type { ThreatDetail } from "@/lib/api"
import { getApiUrl } from "@/lib/api/client"
import { requireRole } from "@/lib/roles"
import type { IpEnrichment } from "@/lib/ip-enrichment"

type CorrelationAlert = { alertKey: string; level: string; title: string; description: string; createdAt: string }

async function readEnrichmentCache(ip: string): Promise<IpEnrichment | null> {
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

async function fetchCorrelationAlerts(ip: string): Promise<CorrelationAlert[]> {
  try {
    const headers: Record<string, string> = process.env.INGEST_SHARED_SECRET
      ? { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET }
      : {}
    const res = await fetch(`${getApiUrl()}/alerts/by-ip/${encodeURIComponent(ip)}`, { cache: "no-store", headers })
    if (!res.ok) return []
    const body = (await res.json()) as { alerts?: CorrelationAlert[] }
    return body.alerts ?? []
  } catch { return [] }
}

export interface ThreatAnalysis {
  actorProfile: string
  intent: string
  sophistication: "script-kiddie" | "organized-crime" | "apt-like"
  keyTactics: string[]
  recommendation: string
  analyzedAt: string
}

export async function GET(req: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const ip = req.nextUrl.searchParams.get("ip")
  if (!ip) return NextResponse.json(null)

  const { rows } = await db.query(
    `SELECT analysis, analyzed_at FROM ai_threat_cache WHERE ip = $1`,
    [ip],
  )
  if (!rows[0]) return NextResponse.json(null)

  return NextResponse.json({
    ...rows[0].analysis,
    analyzedAt: rows[0].analyzed_at.toISOString(),
  } as ThreatAnalysis)
}

export async function POST(req: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const apiKey = getOpenAiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key no configurada." },
      { status: 503 },
    )
  }

  const { ip, threat } = (await req.json()) as { ip: string; threat: ThreatDetail }

  const [enrichment, correlationAlerts] = await Promise.all([
    readEnrichmentCache(ip),
    fetchCorrelationAlerts(ip),
  ])

  const activeCats = Object.entries(threat.risk.commandCategories)
    .filter(([, commands]) => commands.length > 0)
    .map(([category, commands]) => `  ${category}: ${commands.slice(0, 6).join(", ")}`)
    .join("\n")

  const serviceLines = threat.protocols
    ? Object.entries(threat.protocols.byService)
        .map(([protocol, stats]) => {
          const ports = stats.ports.length > 0 ? stats.ports.join(", ") : "n/a"
          return `- ${protocol.toUpperCase()}: ${stats.hits} eventos, ${stats.authAttempts} auth, ${stats.commandEvents} commands, puertos ${ports}`
        })
        .join("\n")
    : ""

  // Raw command sequence with timing, not just a sample — lets the model reason
  // about order/intent (e.g. recon before backdoor) instead of a bag of words.
  const rawCommandLines = threat.classifiedCommands
    .slice(0, 60)
    .map((c) => `  [${c.ts}] (${c.category}) ${c.command}`)
    .join("\n")

  const vt = enrichment?.virustotal
  const ab = enrichment?.abuseipdb
  const threatIntelBlock = (vt || ab)
    ? [
        ab ? `- AbuseIPDB: ${ab.abuseConfidenceScore}% confidence, ${ab.totalReports} reports, ISP ${ab.isp || "n/a"}, pais ${ab.countryName || ab.countryCode || "n/a"}${ab.isVpn ? ", VPN" : ""}${ab.isTor ? ", Tor" : ""}` : "- AbuseIPDB: sin datos",
        vt ? `- VirusTotal: ${vt.last_analysis_stats.malicious} malicious / ${vt.last_analysis_stats.suspicious} suspicious / ${vt.last_analysis_stats.harmless} harmless de ${Object.keys(vt.last_analysis_results).length} motores, AS${vt.asn ?? "?"} ${vt.as_owner || ""}, reputation ${vt.reputation}${vt.tags.length ? `, tags: ${vt.tags.join(", ")}` : ""}` : "- VirusTotal: sin datos",
      ].join("\n")
    : "  ninguno disponible"

  const alertsBlock = correlationAlerts.length > 0
    ? correlationAlerts.slice(0, 15).map((a) => `  - [${a.level.toUpperCase()}] ${a.title} — ${a.description}`).join("\n")
    : "  ninguna otra alerta de correlacion para esta IP"

  const prompt = `Eres un analista de threat intelligence revisando un actor malicioso detectado en un honeypot.

## IP: ${ip}
- Risk score: ${threat.risk.score}/100 (${threat.risk.level})
- Protocolos: ${threat.protocolsSeen.map((protocol) => protocol.toUpperCase()).join(" + ") || "ninguno"}
- Multi-service: ${threat.crossProtocol ? "Si" : "No"}

## Reputacion externa (VirusTotal / AbuseIPDB)
${threatIntelBlock}

## Otras alertas de correlacion disparadas por esta IP
${alertsBlock}

## SSH${threat.ssh ? `
- Sesiones: ${threat.ssh.sessions}
- Auth attempts: ${threat.ssh.authAttempts}
- Login exitoso: ${threat.ssh.loginSuccess ? "SI" : "NO"}` : ": no aplica"}

## HTTP${threat.web ? `
- Hits: ${threat.web.hits}
- Tipos de ataque: ${threat.web.attackTypes.join(", ")}` : ": no aplica"}

## Servicios adicionales${threat.protocols ? `
- Total eventos: ${threat.protocols.totalHits}
- Auth attempts: ${threat.protocols.authAttempts}
- Command events: ${threat.protocols.commandEvents}
- Unique ports: ${threat.protocols.uniquePorts}
- Credential reuse: ${threat.protocols.credentialReuse ? "SI" : "NO"}
${serviceLines}` : ": no aplica"}

## Categorias de comportamiento detectadas
${activeCats || "  ninguna"}

## Secuencia de comandos ejecutados (orden cronologico, hasta 60)
${rawCommandLines || "  ninguno"}

## Factores principales
${threat.risk.topFactors.map((factor) => `  - ${factor}`).join("\n") || "  ninguno"}

## Score breakdown
  SSH: ${threat.risk.breakdown.ssh} | Web: ${threat.risk.breakdown.web} | Services: ${threat.risk.breakdown.protocols} | Commands: ${threat.risk.breakdown.commands} | Cross-proto: ${threat.risk.breakdown.crossProto}

Usa la reputacion externa y las otras alertas de correlacion para matizar tu analisis: una IP con alto score en VirusTotal/AbuseIPDB o que ya dispara sensor_sweep/cred_reuse en otros sensores es mas probablemente parte de una operacion organizada o botnet, no un script kiddie aislado. La secuencia cronologica de comandos importa: reconocimiento antes de persistencia sugiere un operador metodico.

Devuelve UNICAMENTE un JSON valido (sin markdown):
{
  "actorProfile": "descripcion en espanol de 2-3 oraciones sobre quien es este actor y su comportamiento observado",
  "intent": "que estaba intentando lograr, en espanol, 1-2 oraciones",
  "sophistication": "script-kiddie | organized-crime | apt-like",
  "keyTactics": ["tactica 1", "tactica 2", "tactica 3"],
  "recommendation": "que vigilar o hacer al respecto, en espanol, 1-2 oraciones"
}`

  try {
    const client = new OpenAI({ apiKey })
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 900,
      temperature: 0.2,
      response_format: { type: "json_object" },
    })

    const raw = response.choices[0]?.message?.content ?? "{}"
    const ai = JSON.parse(raw)
    const analyzedAt = new Date()

    const result: ThreatAnalysis = {
      actorProfile: ai.actorProfile ?? "",
      intent: ai.intent ?? "",
      sophistication: ai.sophistication ?? "script-kiddie",
      keyTactics: Array.isArray(ai.keyTactics) ? ai.keyTactics : [],
      recommendation: ai.recommendation ?? "",
      analyzedAt: analyzedAt.toISOString(),
    }

    const { analyzedAt: _at, ...analysis } = result
    await db.query(
      `INSERT INTO ai_threat_cache (ip, analysis, analyzed_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (ip) DO UPDATE SET analysis = EXCLUDED.analysis, analyzed_at = EXCLUDED.analyzed_at`,
      [ip, analysis, analyzedAt],
    )

    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
