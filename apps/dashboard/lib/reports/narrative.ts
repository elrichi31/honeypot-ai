// Server-only: turns a collected report into the written analysis a client
// actually reads. Same OpenAI wiring as app/api/ai/* (key from settings,
// gpt-4o-mini, JSON mode) — see app/api/ai/threat-analysis/route.ts.
import OpenAI from "openai"
import { getOpenAiKey } from "@/lib/server-config"
import type { Locale } from "@/lib/i18n/dictionaries"
import type { ClientReportData, ReportNarrative } from "./types"
import { originLine } from "./shared/threat-intel-view"

const LOCALE_LANGUAGE: Record<string, string> = {
  en: "English",
  es: "Spanish",
}

// Four narrative blocks plus one observation per report section.
const MAX_TOKENS = 2600

export const NARRATIVE_SECTIONS = [
  "timeline",
  "sources",
  "sensors",
  "mitre",
  "actors",
  "web",
  "credentials",
  "reconnaissance",
  "geo",
  "classification",
  "history",
] as const

export type NarrativeSection = (typeof NARRATIVE_SECTIONS)[number]

/** Keeps only the known section keys with usable prose — the model can omit,
 *  misspell or pad a key, and none of that should reach the report. */
export function pickSections(raw: unknown): Partial<Record<NarrativeSection, string>> {
  if (!raw || typeof raw !== "object") return {}
  const source = raw as Record<string, unknown>
  const out: Partial<Record<NarrativeSection, string>> = {}
  for (const key of NARRATIVE_SECTIONS) {
    const value = source[key]
    if (typeof value === "string" && value.trim()) out[key] = value.trim()
  }
  return out
}

/**
 * Compact text digest of the report — this is what the model sees, not the
 * full ClientReportData (sensor profiles and malware blobs would blow the
 * context for no gain). Pure so it can be asserted on without a network call.
 */
export function buildNarrativeDigest(data: ClientReportData): string {
  const { meta, overview, kpiTrends, mitre, botRatio, insights, geo, topCredentials, credentialSummary, history, threatIntel } = data

  const delta = (d: number | null) => (d == null ? "no prior data" : `${d > 0 ? "+" : ""}${d}% vs previous period`)

  const protocols = [
    `SSH sessions: ${overview.ssh.sessions} from ${overview.ssh.uniqueIps} IPs`,
    `Web hits: ${overview.web.hits} from ${overview.web.uniqueIps} IPs`,
    ...overview.protocols.map((p) => `${p.protocol}: ${p.count} from ${p.uniqueIps} IPs`),
  ].join("\n")

  const tactics = mitre.tactics
    .map((t) => `${t.tactic}: ${t.techniques.reduce((sum, tech) => sum + tech.count, 0)} hits (${t.techniques.map((tech) => tech.name).slice(0, 3).join(", ")})`)
    .join("\n")

  const creds = topCredentials
    .slice(0, 10)
    .map((c) => `${c.username ?? "-"} / ${c.password ?? "-"} — ${c.attempts} attempts, ${c.successCount} accepted`)
    .join("\n")

  const countries = geo.slice(0, 8).map((g) => `${g.country}: ${g.count} events (${g.share.toFixed(1)}%)`).join("\n")

  const historyBlock = history
    ? `Lake coverage: ${history.firstBucket ?? "?"} to ${history.lastBucket ?? "?"}
Total events over that span: ${history.totalEvents}
SSH login attempts: ${history.totalAttempts}, success rate ${history.successRatePct.toFixed(1)}%
By protocol: ${history.byProtocol.map((p) => `${p.label} ${p.count}`).join(", ")}`
    : "not available"

  // The per-actor block the report already prints — the summary should be able
  // to name the worst actor instead of talking about "attackers" in the abstract.
  const actors = (threatIntel?.actors ?? [])
    .slice(0, 5)
    .map((a) => {
      const rep = [
        a.abuseScore != null && `AbuseIPDB ${a.abuseScore}%`,
        a.vtMalicious != null && `VirusTotal ${a.vtMalicious}/${a.vtEngineCount ?? 0}`,
      ].filter(Boolean).join(", ")
      return `${a.ip} — risk ${a.score}/100 (${a.level}), ${a.protocols.join("+") || "no protocol"}, ${originLine(a)}${rep ? `, ${rep}` : ""}${
        a.analysis ? `\n  Analysis: ${a.analysis.sophistication} — ${a.analysis.intent || a.analysis.actorProfile}` : ""
      }`
    })
    .join("\n")

  // Every sensor, including the silent ones — "nothing hit this decoy" is a
  // finding the model should be able to point at.
  const fleet = data.sensors
    .map((p) => `${p.sensor.name} (${p.sensor.protocol}, ${p.sensor.online ? "online" : "offline"}): ${p.sensor.eventsTotal} events (${p.eventShare.toFixed(1)}% of client), ${p.uniqueIps} unique IPs, ${p.authAttempts} auth attempts, ${p.successCount} accepted, ${p.malwareCount} malware`)
    .join("\n")

  const webProfiles = data.sensors.map((p) => p.web).filter(Boolean)
  const webBlock = webProfiles.length > 0
    ? (() => {
        const sum = (pick: (w: NonNullable<typeof webProfiles[number]>) => number) =>
          webProfiles.reduce((acc, w) => acc + pick(w!), 0)
        const types = new Map<string, number>()
        for (const w of webProfiles) for (const a of w!.topAttackTypes) types.set(a.label, (types.get(a.label) ?? 0) + a.count)
        const top = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
        return `HTTP hits: ${sum((w) => w.hits)} across ${sum((w) => w.sessionCount)} observed sessions (${sum((w) => w.fingerprintedSessions)} fingerprinted)
Unique paths: ${sum((w) => w.uniquePaths)}
Canary hits: ${sum((w) => w.canaryHits)}, chained requests: ${sum((w) => w.chainHits)}, sessions rotating IPs: ${sum((w) => w.multiIpSessions)}
Attack types: ${top.map(([label, count]) => `${label} ${count}`).join(", ") || "none"}`
      })()
    : "no HTTP decoy activity"

  const iocCounts = threatIntel
    ? `C2/payload URLs: ${threatIntel.iocs.c2.length}, planted SSH keys: ${threatIntel.iocs.sshKeys.length}, credential indicators: ${threatIntel.iocs.credentials.length}, HASSH fingerprints: ${threatIntel.iocs.hassh.length}`
    : "none collected"

  return `## Client and period
Client: ${meta.clientName}
Reporting period: ${meta.periodLabel} (timezone ${meta.timezone})

## Volume this period
Total events: ${kpiTrends.events.current} (${delta(kpiTrends.events.deltaPct)})
SSH sessions: ${kpiTrends.sshSessions.current} (${delta(kpiTrends.sshSessions.deltaPct)})
Web hits: ${kpiTrends.webHits.current} (${delta(kpiTrends.webHits.deltaPct)})
Unique attacking IPs: ${kpiTrends.uniqueIps.current} (${delta(kpiTrends.uniqueIps.deltaPct)})
Successful logins into the decoy: ${overview.ssh.successfulLogins}

## Activity by service
${protocols || "none"}

## MITRE ATT&CK tactics observed
${tactics || "none"}

## Credential attacks
Total attempts: ${credentialSummary.totalAttempts}, accepted: ${credentialSummary.successfulAttempts}
Distinct usernames: ${credentialSummary.uniqueUsernames}, distinct passwords: ${credentialSummary.uniquePasswords}
Password-spray passwords: ${credentialSummary.sprayPasswords}, targeted usernames: ${credentialSummary.targetedUsernames}
Top attempted pairs:
${creds || "none"}

## Attacker behaviour funnel
Connections: ${insights.funnel.connections}
Auth attempts: ${insights.funnel.authAttempts}
Successful logins: ${insights.funnel.loginSuccess}
Commands executed after login: ${insights.funnel.commands}
High-signal compromise activity: ${insights.funnel.highSignalCompromise}

## Automation
Bot sessions: ${botRatio.bot}, human-like: ${botRatio.human}, unclassified: ${botRatio.unknown}

## Geographic origin (by event volume, not distinct IPs)
${countries || "none"}

## Highest-risk individual actors this period
${actors || "none scored"}

## Indicators of compromise collected
${iocCounts}

## Decoy fleet deployed for this client
${fleet || "none"}

## HTTP decoy activity
${webBlock}

## Long-range history from the analytics lake
${historyBlock}`
}

function buildPrompt(digest: string, language: string): string {
  return `You are a security analyst writing the narrative sections of a honeypot activity report delivered to a client.

Write in ${language}. Every string in the JSON output must be in ${language}.

The client operates decoy systems (honeypots). Every "successful login" happened on a decoy, NOT on a production system — never describe it as a breach of the client's real infrastructure. Frame it as intelligence about who is attacking and how.

Rules:
- Use only the figures below. Never invent a number, a country, a CVE, or an actor name.
- Write for a business reader: plain language, no unexplained jargon.
- Be specific — cite the actual numbers that matter instead of saying "significant activity".
- If a figure looks anomalous (a huge percentage swing, a near-100% login success rate), explain WHY it is expected on a honeypot rather than presenting it as alarming.
- No filler, no restating the whole table in prose.

${digest}

For "sections", write ONE observation per section: the most interesting thing that section's own numbers reveal — a ratio, an outlier, a pattern, something a reader would miss by only looking at the table. Cite the figures you are reasoning from. If a section's data shows nothing noteworthy, return an empty string for it rather than padding.

Return ONLY valid JSON (no markdown) with this exact structure:
{
  "executiveSummary": "3-4 sentences: what happened this period, how it compares to before, and the single most important takeaway",
  "threatLandscape": "2-3 sentences on who attacked and how — services targeted, tactics, automation level, origin",
  "credentialFindings": "2-3 sentences on the credential attacks: what was tried, what patterns it reveals about the attackers' tooling",
  "recommendations": ["3 to 4 concrete, actionable items grounded in what the data shows"],
  "sections": {
    "timeline": "1-2 sentences on the activity timeline: peaks, quiet periods, whether volume is steady or bursty",
    "sources": "1-2 sentences on which services drew the most traffic and what that mix says about the attackers' targeting",
    "sensors": "1-2 sentences on the decoy fleet: which sensor absorbed most of the activity, and what a quiet sensor tells the client",
    "actors": "1-2 sentences on the highest-risk individual sources: what separates the worst one from the rest",
    "web": "1-2 sentences on the HTTP decoys: what the attack mix and the canary/chained requests say about whether this was targeted or background scanning",
    "mitre": "1-2 sentences on the tactic distribution and what stage of the attack chain the activity concentrates in",
    "credentials": "1-2 sentences on the credential table: spray vs targeted, reused pairs, default-credential lists",
    "reconnaissance": "1-2 sentences on the funnel drop-off: how many got in, how many did anything after",
    "geo": "1-2 sentences on origin concentration, and the caveat that these are event counts and hosting/VPN ranges skew attribution",
    "classification": "1-2 sentences on the bot vs human split and what it implies about automation",
    "history": "1-2 sentences comparing this period against the longer history, or an empty string if no history data was provided"
  }
}`
}

/**
 * Returns null when AI is simply not configured — that is a normal state, not
 * an error: the report renders exactly as before without the narrative.
 * Throws only on a real API failure, so the caller can log it.
 */
export async function generateReportNarrative(
  data: ClientReportData,
  locale: Locale,
): Promise<ReportNarrative | null> {
  const apiKey = getOpenAiKey()
  if (!apiKey) return null

  const client = new OpenAI({ apiKey })
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: buildPrompt(buildNarrativeDigest(data), LOCALE_LANGUAGE[locale] ?? "English") }],
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
    response_format: { type: "json_object" },
  })

  const ai = JSON.parse(response.choices[0]?.message?.content ?? "{}")
  return {
    executiveSummary: typeof ai.executiveSummary === "string" ? ai.executiveSummary : "",
    threatLandscape: typeof ai.threatLandscape === "string" ? ai.threatLandscape : "",
    credentialFindings: typeof ai.credentialFindings === "string" ? ai.credentialFindings : "",
    recommendations: Array.isArray(ai.recommendations) ? ai.recommendations.filter((r: unknown) => typeof r === "string") : [],
    sections: pickSections(ai.sections),
    generatedAt: new Date().toISOString(),
  }
}
