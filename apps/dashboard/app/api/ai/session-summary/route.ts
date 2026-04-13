import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { getOpenAiKey } from "@/lib/server-config"
import { analyzeRisk, preClassify } from "@/lib/risk-score"
import type { HoneypotEvent, ApiSession } from "@/lib/api"

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
  const apiKey = getOpenAiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured. Ve a Settings para agregarlo." },
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
  const prompt = `Eres un analista de ciberseguridad revisando una sesión de un honeypot SSH.

## Datos de la sesión
- IP origen: ${session.srcIp}
- Cliente SSH: ${session.clientVersion ?? "desconocido"}
- HASSH: ${session.hassh ?? "desconocido"}
- Login exitoso: ${session.loginSuccess ? "SÍ" : "NO"}
- Duración: ${session.endedAt ? `${Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)}s` : "activa"}

## Intentos de autenticación (${risk.factors.authAttempts} total)
${authAttempts.join("\n") || "ninguno"}

## Comandos ejecutados (${commands.length} total)
${commands.slice(0, 25).join("\n") || "ninguno"}

## Análisis algorítmico previo
- Risk score calculado: ${risk.score}/100 (${risk.level})
- Clasificación sugerida: ${hint}
- Factores detectados:
${risk.breakdown.map((b) => `  • ${b.label} (+${b.points}pts)`).join("\n") || "  • ninguno"}

## Tu tarea
Devuelve ÚNICAMENTE un JSON válido con esta estructura exacta (sin markdown, sin texto extra):
{
  "summary": "descripción en español de 2-3 oraciones sobre qué hizo el atacante y su comportamiento",
  "classification": "una de: brute-force bot | opportunistic scanner | interactive operator | malware dropper | recon-only | credential stuffing",
  "keyIndicators": ["indicador 1", "indicador 2", "indicador 3"],
  "recommendation": "qué se debe hacer o vigilar, en español, 1-2 oraciones"
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
      summary: ai.summary ?? "No se pudo generar resumen.",
      classification: ai.classification ?? hint,
      riskScore: risk.score,
      riskLevel: risk.level,
      riskBreakdown: risk.breakdown,
      keyIndicators: Array.isArray(ai.keyIndicators) ? ai.keyIndicators : [],
      recommendation: ai.recommendation ?? "",
    }

    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
