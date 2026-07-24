import { NextRequest, NextResponse } from "next/server"
import {
  readConfig,
  writeConfig,
  getOpenAiKey,
  getDiscordWebhookUrl,
  getIngestSecret,
  getSpectraAnalyzeToken,
  getSpectraAnalyzeUrl,
  getVirusTotalKey,
  CONFIG_FIELDS,
  SECRET_FIELD_KEYS,
  AppConfig,
} from "@/lib/server-config"
import { getVtQuota } from "@/lib/virustotal"
import { getAbuseQuota } from "@/lib/ip-enrichment"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

function maskKey(key: string | undefined): string {
  if (!key) return ""
  return `${key.slice(0, 6)}${"•".repeat(20)}`
}

// Resolves the effective value for a field: config → env fallback → default.
function resolvedValue(field: (typeof CONFIG_FIELDS)[number], config: AppConfig): unknown {
  const raw = config[field.key]
  if (raw !== undefined && raw !== null) return raw
  if (field.envFallback) {
    const env = process.env[field.envFallback]
    if (env !== undefined) {
      return field.type === "number" ? Number(env) || field.defaultValue : env
    }
  }
  return field.defaultValue
}

export async function GET() {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  // Resolve env-overridden values for secret fields so masking uses the same
  // source as the getter functions (config file takes priority, then env).
  const effectiveSecrets: Partial<Record<keyof AppConfig, string | undefined>> = {
    openaiApiKey: getOpenAiKey(),
    discordWebhookUrl: getDiscordWebhookUrl(),
    ingestSecret: getIngestSecret() || undefined,
    spectraAnalyzeToken: getSpectraAnalyzeToken(),
    virustotalApiKey: getVirusTotalKey(),
  }

  const config = readConfig()
  const vtKey = effectiveSecrets.virustotalApiKey
  const vtQuota = vtKey ? await getVtQuota().catch(() => null) : null
  const abuseQuota = config.abuseipdbApiKey ? await getAbuseQuota().catch(() => null) : null

  const response: Record<string, unknown> = {}

  for (const field of CONFIG_FIELDS) {
    const k = field.key as string
    if (field.secret) {
      const val = effectiveSecrets[field.key] ?? (resolvedValue(field, config) as string | undefined)
      response[k] = val ? maskKey(val) : ""
      response[`has${k[0].toUpperCase()}${k.slice(1)}`] = !!val
    } else {
      response[k] = resolvedValue(field, config)
    }
  }

  // Rename the auto-generated boolean keys to the legacy names consumers expect.
  response.hasKey = response.hasOpenaiApiKey
  delete response.hasOpenaiApiKey
  response.hasDiscordWebhook = response.hasDiscordWebhookUrl
  delete response.hasDiscordWebhookUrl
  response.hasVirusTotalKey = response.hasVirustotalApiKey
  delete response.hasVirustotalApiKey
  response.hasAbuseipdbKey = response.hasAbuseipdbApiKey
  delete response.hasAbuseipdbApiKey
  response.hasIpinfoKey = response.hasIpinfoApiKey
  delete response.hasIpinfoApiKey
  response.vtQuota = vtQuota
  response.abuseQuota = abuseQuota

  return NextResponse.json(response)
}

export async function POST(req: NextRequest) {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  const body = await req.json()
  const config = readConfig()

  for (const field of CONFIG_FIELDS) {
    const k = field.key as string
    if (!(k in body)) continue

    const raw = body[k]

    if (field.type === "secret") {
      if (typeof raw !== "string")
        return NextResponse.json({ error: `Invalid value for ${k}` }, { status: 400 })
      const trimmed = raw.trim()
      // Guard: never save the masked display value back to disk.
      if (!trimmed.includes("•"))
        (config as Record<string, unknown>)[k] = trimmed || undefined
    } else if (field.type === "number") {
      let num = Number(raw) || (field.defaultValue as number)
      if (field.clamp) num = Math.max(field.clamp[0], Math.min(field.clamp[1], num))
      ;(config as Record<string, unknown>)[k] = num
    } else if (field.type === "enum") {
      const val = typeof raw === "string" ? raw : field.defaultValue
      ;(config as Record<string, unknown>)[k] = field.allowedValues?.includes(val as string)
        ? val
        : field.defaultValue
    } else if (field.type === "object") {
      if (typeof raw === "object" && raw !== null)
        (config as Record<string, unknown>)[k] = raw
    } else {
      // string | url
      ;(config as Record<string, unknown>)[k] = typeof raw === "string" ? raw.trim() || undefined : undefined
    }
  }

  writeConfig(config)

  const changedKeys = Object.keys(body).filter((k) =>
    SECRET_FIELD_KEYS.has(k) ? !!body[k] : true
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
