import fs from "fs"
import path from "path"

export interface AppConfig {
  openaiApiKey?: string
  abuseipdbApiKey?: string
  ipinfoApiKey?: string
  discordWebhookUrl?: string
  // Honeypot infrastructure
  honeypotIp?: string
  sshPort?: number
  ingestPort?: number
  ingestApiUrl?: string
  // Display
  timezone?: string
}

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json")

function ensureDir() {
  const dir = path.dirname(CONFIG_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function readConfig(): AppConfig {
  try {
    ensureDir()
    if (!fs.existsSync(CONFIG_PATH)) return {}
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))
  } catch {
    return {}
  }
}

export function writeConfig(config: AppConfig): void {
  ensureDir()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
}

/** Returns the OpenAI key: config file takes priority, then env var */
export function getOpenAiKey(): string | undefined {
  const config = readConfig()
  return config.openaiApiKey || process.env.OPENAI_API_KEY || undefined
}

/** Returns the Discord webhook URL: config file takes priority, then env var */
export function getDiscordWebhookUrl(): string | undefined {
  const config = readConfig()
  return config.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL || undefined
}
