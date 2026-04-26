import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { db } from "@/lib/db"
import { getOpenAiKey } from "@/lib/server-config"
import type { ThreatDetail } from "@/lib/api"

export interface ThreatAnalysis {
  actorProfile: string
  intent: string
  sophistication: "script-kiddie" | "organized-crime" | "apt-like"
  keyTactics: string[]
  recommendation: string
  analyzedAt: string
}

export async function GET(req: NextRequest) {
  const ip = req.nextUrl.searchParams.get("ip")
  if (!ip) return NextResponse.json(null)

  const { rows } = await db.query(
    `SELECT analysis, analyzed_at FROM ai_threat_cache WHERE ip = $1`,
    [ip]
  )
  if (!rows[0]) return NextResponse.json(null)

  return NextResponse.json({
    ...rows[0].analysis,
    analyzedAt: rows[0].analyzed_at.toISOString(),
  } as ThreatAnalysis)
}

export async function POST(req: NextRequest) {
  const apiKey = getOpenAiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key no configurada." },
      { status: 503 }
    )
  }

  const { ip, threat } = (await req.json()) as { ip: string; threat: ThreatDetail }

  const activeCats = Object.entries(threat.risk.commandCategories)
    .filter(([, cmds]) => cmds.length > 0)
    .map(([cat, cmds]) => `  ${cat}: ${cmds.slice(0, 6).join(", ")}`)
    .join("\n")

  const prompt = `Eres un analista de threat intelligence revisando un actor malicioso detectado en un honeypot.

## IP: ${ip}
- Risk score: ${threat.risk.score}/100 (${threat.risk.level})
- Protocolos: ${[threat.ssh ? "SSH" : null, threat.web ? "HTTP" : null].filter(Boolean).join(" + ")}
- Cross-protocol (SSH + web): ${threat.crossProtocol ? "Sí" : "No"}

## SSH${threat.ssh ? `
- Sesiones: ${threat.ssh.sessions}
- Auth attempts: ${threat.ssh.authAttempts}
- Login exitoso: ${threat.ssh.loginSuccess ? "SÍ" : "NO"}` : ": no aplica"}

## HTTP${threat.web ? `
- Hits: ${threat.web.hits}
- Tipos de ataque: ${threat.web.attackTypes.join(", ")}` : ": no aplica"}

## Categorías de comportamiento detectadas
${activeCats || "  ninguna"}

## Factores principales
${threat.risk.topFactors.map((f) => `  • ${f}`).join("\n") || "  ninguno"}

## Score breakdown
  SSH: ${threat.risk.breakdown.ssh} | Web: ${threat.risk.breakdown.web} | Commands: ${threat.risk.breakdown.commands} | Cross-proto: ${threat.risk.breakdown.crossProto}

Devuelve ÚNICAMENTE un JSON válido (sin markdown):
{
  "actorProfile": "descripción en español de 2-3 oraciones sobre quién es este actor y su comportamiento observado",
  "intent": "qué estaba intentando lograr, en español, 1-2 oraciones",
  "sophistication": "script-kiddie | organized-crime | apt-like",
  "keyTactics": ["táctica 1", "táctica 2", "táctica 3"],
  "recommendation": "qué vigilar o hacer al respecto, en español, 1-2 oraciones"
}`

  try {
    const client = new OpenAI({ apiKey })
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
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
      [ip, analysis, analyzedAt]
    )

    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
