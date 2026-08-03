// The deep per-actor threat analysis: prompt + web-search model call + cache
// write. Lives here rather than in the route so the client PDF report can run
// the exact same analysis the threats page shows.
import OpenAI from "openai"
import { db } from "@/lib/db"
import { getOpenAiKey } from "@/lib/server-config"
import type { ThreatDetail } from "@/lib/api"
import { getApiUrl } from "@/lib/api/client"
import { buildThreatPrompt, type CorrelationAlert } from "@/lib/ai/threat-prompt"
import { readEnrichmentCache } from "@/lib/ai/threat-cache"

// Web search only exists on the Responses API and the gpt-5 family; override
// with OPENAI_THREAT_MODEL if the account is gated to something else.
const MODEL = process.env.OPENAI_THREAT_MODEL ?? "gpt-5-mini"

export interface ThreatSource {
  title: string
  url: string
}

export interface ThreatAnalysis {
  actorProfile: string
  intent: string
  sophistication: "script-kiddie" | "organized-crime" | "apt-like"
  keyTactics: string[]
  webFindings: string
  iocs: string[]
  sources: ThreatSource[]
  recommendation: string
  analyzedAt: string
}

export async function fetchCorrelationAlerts(ip: string): Promise<CorrelationAlert[]> {
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

// The model returns prose; the URLs come from the search tool's own annotations
// so a hallucinated link can never reach the UI.
function extractSources(response: { output?: unknown }): ThreatSource[] {
  const seen = new Map<string, ThreatSource>()
  const output = Array.isArray(response.output) ? response.output : []
  for (const item of output as any[]) {
    for (const part of item?.content ?? []) {
      for (const ann of part?.annotations ?? []) {
        if (ann?.type === "url_citation" && ann.url && !seen.has(ann.url)) {
          seen.set(ann.url, { url: ann.url, title: ann.title || ann.url })
        }
      }
    }
  }
  return [...seen.values()].slice(0, 8)
}

/** Runs the analysis and writes it to `ai_threat_cache`. Throws when OpenAI is
 *  unconfigured or the model returns nothing usable. */
export async function analyzeThreat(ip: string, threat: ThreatDetail): Promise<ThreatAnalysis> {
  const apiKey = getOpenAiKey()
  if (!apiKey) throw new Error("OpenAI API key no configurada.")

  const [enrichment, correlationAlerts] = await Promise.all([
    readEnrichmentCache(ip),
    fetchCorrelationAlerts(ip),
  ])

  const client = new OpenAI({ apiKey })
  const response = await client.responses.create({
    model: MODEL,
    input: buildThreatPrompt(ip, threat, enrichment, correlationAlerts),
    tools: [{ type: "web_search" }],
    // Reasoning tokens count against max_output_tokens: too low a budget and
    // the model thinks itself out of an answer, returning incomplete + empty
    // output_text. Low effort keeps the searching-and-summarising cheap.
    reasoning: { effort: "low" },
    max_output_tokens: 16000,
  })

  const text = response.output_text ?? ""
  // The search tool can push the model into fenced output despite the prompt.
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)
  if (!json) {
    throw new Error(
      `El modelo ${MODEL} no devolvio analisis (status: ${response.status ?? "?"}${
        response.incomplete_details?.reason ? `, ${response.incomplete_details.reason}` : ""
      }).`,
    )
  }

  const ai = JSON.parse(json)
  const analyzedAt = new Date()
  const result: ThreatAnalysis = {
    actorProfile: ai.actorProfile ?? "",
    intent: ai.intent ?? "",
    sophistication: ai.sophistication ?? "script-kiddie",
    keyTactics: Array.isArray(ai.keyTactics) ? ai.keyTactics : [],
    webFindings: ai.webFindings ?? "",
    iocs: Array.isArray(ai.iocs) ? ai.iocs : [],
    sources: extractSources(response),
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

  return result
}
