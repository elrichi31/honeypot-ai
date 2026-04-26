import { NextRequest, NextResponse } from "next/server"
import { readConfig, writeConfig, getOpenAiKey } from "@/lib/server-config"

function maskKey(key: string | undefined): string {
  if (!key) return ""
  return `${key.slice(0, 6)}${"•".repeat(20)}`
}

export async function GET() {
  const key = getOpenAiKey()
  const config = readConfig()
  return NextResponse.json({
    openaiApiKey: key ? maskKey(key) : "",
    hasKey: !!key,
    abuseipdbApiKey: config.abuseipdbApiKey ? maskKey(config.abuseipdbApiKey) : "",
    hasAbuseipdbKey: !!config.abuseipdbApiKey,
    ipinfoApiKey: config.ipinfoApiKey ? maskKey(config.ipinfoApiKey) : "",
    hasIpinfoKey: !!config.ipinfoApiKey,
    honeypotIp: config.honeypotIp ?? process.env.HONEYPOT_IP ?? "",
    sshPort: config.sshPort ?? (Number(process.env.HONEYPOT_SSH_PORT) || 22),
    ingestPort: config.ingestPort ?? (Number(process.env.HONEYPOT_INGEST_PORT) || 8022),
    ingestApiUrl: config.ingestApiUrl ?? process.env.INTERNAL_API_URL ?? "http://localhost:3000",
    timezone: config.timezone ?? process.env.DASHBOARD_TIMEZONE ?? "UTC",
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const config = readConfig()

  if ("openaiApiKey" in body) {
    if (typeof body.openaiApiKey !== "string")
      return NextResponse.json({ error: "Invalid key" }, { status: 400 })
    config.openaiApiKey = body.openaiApiKey.trim() || undefined
  }
  if ("abuseipdbApiKey" in body) config.abuseipdbApiKey = body.abuseipdbApiKey?.trim() || undefined
  if ("ipinfoApiKey" in body) config.ipinfoApiKey = body.ipinfoApiKey?.trim() || undefined
  if ("honeypotIp" in body) config.honeypotIp = body.honeypotIp?.trim() || undefined
  if ("sshPort" in body) config.sshPort = Number(body.sshPort) || 22
  if ("ingestPort" in body) config.ingestPort = Number(body.ingestPort) || 8022
  if ("ingestApiUrl" in body) config.ingestApiUrl = body.ingestApiUrl?.trim() || undefined
  if ("timezone" in body) config.timezone = body.timezone?.trim() || undefined

  writeConfig(config)
  return NextResponse.json({ ok: true })
}
