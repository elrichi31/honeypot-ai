import { NextRequest, NextResponse } from "next/server"
import { readConfig, writeConfig, getOpenAiKey, getDiscordWebhookUrl } from "@/lib/server-config"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

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
    discordWebhookUrl: getDiscordWebhookUrl() ? maskKey(getDiscordWebhookUrl()) : "",
    hasDiscordWebhook: !!getDiscordWebhookUrl(),
    honeypotIp: config.honeypotIp ?? process.env.HONEYPOT_IP ?? "",
    sshPort: config.sshPort ?? (Number(process.env.HONEYPOT_SSH_PORT) || 22),
    ingestPort: config.ingestPort ?? (Number(process.env.HONEYPOT_INGEST_PORT) || 8022),
    ingestApiUrl: config.ingestApiUrl ?? process.env.INTERNAL_API_URL ?? "http://localhost:3000",
    timezone: config.timezone ?? process.env.DASHBOARD_TIMEZONE ?? "UTC",
    alertMinLevel: config.alertMinLevel ?? "critical",
    alertCooldownMinutes: config.alertCooldownMinutes ?? 60,
    alertEnabledTypes: {
      threatScore: config.alertEnabledTypes?.threatScore ?? true,
      multiService: config.alertEnabledTypes?.multiService ?? true,
      authBurst: config.alertEnabledTypes?.authBurst ?? true,
      postAuth: config.alertEnabledTypes?.postAuth ?? true,
      attackChain: config.alertEnabledTypes?.attackChain ?? true,
      sensorOffline: config.alertEnabledTypes?.sensorOffline ?? true,
    },
    reportIntervalHours: config.reportIntervalHours ?? 8,
  })
}

export async function POST(req: NextRequest) {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  const body = await req.json()
  const config = readConfig()

  if ("openaiApiKey" in body) {
    if (typeof body.openaiApiKey !== "string")
      return NextResponse.json({ error: "Invalid key" }, { status: 400 })
    config.openaiApiKey = body.openaiApiKey.trim() || undefined
  }
  if ("abuseipdbApiKey" in body) config.abuseipdbApiKey = body.abuseipdbApiKey?.trim() || undefined
  if ("ipinfoApiKey" in body) config.ipinfoApiKey = body.ipinfoApiKey?.trim() || undefined
  if ("discordWebhookUrl" in body) config.discordWebhookUrl = body.discordWebhookUrl?.trim() || undefined
  if ("honeypotIp" in body) config.honeypotIp = body.honeypotIp?.trim() || undefined
  if ("sshPort" in body) config.sshPort = Number(body.sshPort) || 22
  if ("ingestPort" in body) config.ingestPort = Number(body.ingestPort) || 8022
  if ("ingestApiUrl" in body) config.ingestApiUrl = body.ingestApiUrl?.trim() || undefined
  if ("timezone" in body) config.timezone = body.timezone?.trim() || undefined
  if ("alertMinLevel" in body) config.alertMinLevel = body.alertMinLevel === 'high' ? 'high' : 'critical'
  if ("alertCooldownMinutes" in body) config.alertCooldownMinutes = Math.max(1, Number(body.alertCooldownMinutes) || 60)
  if ("alertEnabledTypes" in body && typeof body.alertEnabledTypes === 'object') config.alertEnabledTypes = body.alertEnabledTypes
  if ("reportIntervalHours" in body) config.reportIntervalHours = Number(body.reportIntervalHours) || 0

  writeConfig(config)

  const changedKeys = Object.keys(body).filter((k) =>
    !["openaiApiKey", "abuseipdbApiKey", "ipinfoApiKey", "discordWebhookUrl"].includes(k)
      ? true
      : !!body[k],
  )
  await logAudit({
    action: "UPDATE",
    resource: "SETTINGS",
    resourceName: "Platform Settings",
    details: { fields: changedKeys },
    request: req,
  })

  return NextResponse.json({ ok: true })
}
