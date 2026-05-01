import { getDiscordWebhookUrl } from './runtime-config.js'

type AlertLevel = "critical" | "high" | "info"

const COLORS: Record<AlertLevel, number> = {
  critical: 0xef4444,
  high:     0xf97316,
  info:     0x06b6d4,
}

interface Field { name: string; value: string; inline?: boolean }

interface AlertOptions {
  level: AlertLevel
  title: string
  description: string
  fields?: Field[]
}

const DISCORD_FAILURE_LOG_COOLDOWN_MS = 15 * 60 * 1000
let lastDiscordFailureLogAt = 0

function logDiscordFailure(message: string, extra?: string) {
  const now = Date.now()
  if (now - lastDiscordFailureLogAt < DISCORD_FAILURE_LOG_COOLDOWN_MS) return
  lastDiscordFailureLogAt = now
  console.error(`[discord] ${message}${extra ? `: ${extra}` : ''}`)
}

export async function sendDiscordAlert(opts: AlertOptions): Promise<boolean> {
  const webhookUrl = getDiscordWebhookUrl()
  if (!webhookUrl) return false

  const body = {
    embeds: [{
      title: opts.title,
      description: opts.description,
      color: COLORS[opts.level],
      fields: opts.fields ?? [],
      footer: { text: "Honeypot AI" },
      timestamp: new Date().toISOString(),
    }],
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      logDiscordFailure(`webhook returned ${response.status}`, response.statusText)
      return false
    }
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logDiscordFailure('webhook delivery failed', msg)
    return false
  }
}
