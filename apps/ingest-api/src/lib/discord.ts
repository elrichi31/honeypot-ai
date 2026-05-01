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

export async function sendDiscordAlert(opts: AlertOptions): Promise<void> {
  const webhookUrl = getDiscordWebhookUrl()
  if (!webhookUrl) return

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
      console.warn(`[discord] webhook returned ${response.status}`)
    }
  } catch {
    // best-effort
  }
}
