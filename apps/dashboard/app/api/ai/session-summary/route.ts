import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { getOpenAiKey } from "@/lib/server-config"
import { analyzeRisk, preClassify } from "@/lib/risk-score"
import type { HoneypotEvent, ApiSession } from "@/lib/api"
import { requireRole } from "@/lib/roles"
import { getServerLocale } from "@/lib/i18n/server"
import { logAndRespond } from "@/lib/api-error"

const LOCALE_LANGUAGE: Record<string, string> = {
  en: "English",
  es: "Spanish",
}

export interface SessionAnalysis {
  summary: string
  classification:
    | "brute-force bot"
    | "opportunistic scanner"
    | "interactive operator"
    | "malware dropper"
    | "recon-only"
    | "credential stuffing"
  riskScore: number
  riskLevel: "Low" | "Medium" | "High" | "Critical"
  riskBreakdown: { label: string; points: number }[]
  keyIndicators: string[]
  recommendation: string
}

export async function POST(req: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const locale = await getServerLocale()
  const language = LOCALE_LANGUAGE[locale] ?? "English"

  const apiKey = getOpenAiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured. Go to Settings to add it." },
      { status: 503 }
    )
  }

  const { session, events } = (await req.json()) as {
    session: ApiSession
    events: HoneypotEvent[]
  }

  // ---------- Algorithmic pre-analysis ----------
  const risk = analyzeRisk(session, events)
  const hint = preClassify(risk.factors)

  const commands = events
    .filter((e) => e.eventType === "command.input" && e.command)
    .map((e) => e.command as string)

  const authAttempts = events
    .filter((e) => e.eventType === "auth.success" || e.eventType === "auth.failed")
    .slice(0, 15)
    .map((e) => `${e.username}:${e.password} → ${e.success ? "OK" : "FAIL"}`)

  // ---------- OpenAI prompt ----------
  const none = locale === "es" ? "ninguno" : "none"
  const prompt = `You are a cybersecurity analyst reviewing an SSH honeypot session.
Respond ONLY in ${language}. All text fields in the JSON output must be in ${language}.

## Session data
- Source IP: ${session.srcIp}
- SSH client: ${session.clientVersion ?? "unknown"}
- HASSH: ${session.hassh ?? "unknown"}
- Successful login: ${session.loginSuccess ? "YES" : "NO"}
- Duration: ${session.endedAt ? `${Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)}s` : "active"}

## Authentication attempts (${risk.factors.authAttempts} total)
${authAttempts.join("\n") || none}

## Executed commands (${commands.length} total)
${commands.slice(0, 25).join("\n") || none}

## Algorithmic pre-analysis
- Calculated risk score: ${risk.score}/100 (${risk.level})
- Suggested classification: ${hint}
- Detected factors:
${risk.breakdown.map((b) => `  • ${b.label} (+${b.points}pts)`).join("\n") || `  • ${none}`}

## Your task
Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "summary": "2-3 sentence description of what the attacker did and their behavior",
  "classification": "one of: brute-force bot | opportunistic scanner | interactive operator | malware dropper | recon-only | credential stuffing",
  "keyIndicators": ["indicator 1", "indicator 2", "indicator 3"],
  "recommendation": "what should be done or monitored, 1-2 sentences"
}`

  try {
    const client = new OpenAI({ apiKey })
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.2,
      response_format: { type: "json_object" },
    })

    const raw = response.choices[0]?.message?.content ?? "{}"
    const ai = JSON.parse(raw)

    const result: SessionAnalysis = {
      summary: ai.summary ?? "",
      classification: ai.classification ?? hint,
      riskScore: risk.score,
      riskLevel: risk.level,
      riskBreakdown: risk.breakdown,
      keyIndicators: Array.isArray(ai.keyIndicators) ? ai.keyIndicators : [],
      recommendation: ai.recommendation ?? "",
    }

    return NextResponse.json(result)
  } catch (err: unknown) {
    return logAndRespond(err, { route: "/api/ai/session-summary", srcIp: session.srcIp })
  }
}
