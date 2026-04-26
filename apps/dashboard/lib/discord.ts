import { getDiscordWebhookUrl } from "@/lib/server-config"

export type AlertLevel = "critical" | "high" | "info"

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
  url?: string
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
      url: opts.url,
      footer: { text: "Honeypot AI" },
      timestamp: new Date().toISOString(),
    }],
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // best-effort
  }
}
