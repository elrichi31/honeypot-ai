import fs from 'node:fs'
import path from 'node:path'

interface RuntimeConfig {
  discordWebhookUrl?: string
}

const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json')

function readConfig(): RuntimeConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {}
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as RuntimeConfig
  } catch {
    return {}
  }
}

export function getDiscordWebhookUrl(): string | undefined {
  const config = readConfig()
  return config.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL || undefined
}
