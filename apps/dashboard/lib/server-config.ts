import fs from "fs"
import path from "path"

export interface AlertEnabledTypes {
  threatScore?: boolean
  multiService?: boolean
  authBurst?: boolean
  postAuth?: boolean
  attackChain?: boolean
  sensorOffline?: boolean
}

export interface AppConfig {
  openaiApiKey?: string
  abuseipdbApiKey?: string
  ipinfoApiKey?: string
  spectraAnalyzeUrl?: string
  spectraAnalyzeToken?: string
  discordWebhookUrl?: string
  // Honeypot infrastructure
  honeypotIp?: string
  sshPort?: number
  ingestPort?: number
  ingestApiUrl?: string
  // Shared secret sensors use to authenticate to ingest. Configurable so the
  // installer embeds a real secret instead of the .env placeholder.
  ingestSecret?: string
  // Auth: how long a dashboard login session stays valid (applied on restart).
  sessionDurationHours?: number
  // Display
  timezone?: string
  // Alert configuration
  alertMinLevel?: 'critical' | 'high'
  alertCooldownMinutes?: number
  alertEnabledTypes?: AlertEnabledTypes
  reportIntervalHours?: number
  // Data retention
  retentionIntervalMinutes?: number
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

/** Returns the ingest shared secret: config file takes priority, then env var. */
export function getIngestSecret(): string {
  const config = readConfig()
  return config.ingestSecret || process.env.INGEST_SHARED_SECRET || ""
}

const DEFAULT_SESSION_HOURS = 8

/**
 * Session lifetime in seconds for better-auth, from config (clamped 1h–720h).
 * Read at auth init, so changes apply after a dashboard restart.
 */
export function getSessionDurationSeconds(): number {
  const config = readConfig()
  const hours = config.sessionDurationHours
  if (typeof hours !== "number" || !Number.isFinite(hours)) return DEFAULT_SESSION_HOURS * 3600
  return Math.max(1, Math.min(720, Math.round(hours))) * 3600
}

function isUsableUrl(url: string | undefined | null): url is string {
  return !!url && !url.includes("localhost") && !url.includes("127.0.0.1")
}

/**
 * Resolves the ingest API URL that remote sensors use to reach the platform.
 * Priority: Settings UI (config.ingestApiUrl) → SENSOR_INGEST_URL → NEXT_PUBLIC_API_URL → auto-detected public IP.
 * Returns null only if every source fails (e.g. public IP lookup unreachable).
 */
export async function resolveIngestUrl(): Promise<{ url: string | null; source: string }> {
  const config = readConfig()
  if (isUsableUrl(config.ingestApiUrl)) {
    return { url: config.ingestApiUrl.replace(/\/+$/, ""), source: "settings" }
  }
  if (isUsableUrl(process.env.SENSOR_INGEST_URL)) {
    return { url: process.env.SENSOR_INGEST_URL.replace(/\/+$/, ""), source: "SENSOR_INGEST_URL" }
  }
  if (isUsableUrl(process.env.NEXT_PUBLIC_API_URL)) {
    return { url: process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, ""), source: "NEXT_PUBLIC_API_URL" }
  }
  try {
    const res = await fetch("https://api.ipify.org?format=text", { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error("ipify error")
    return { url: `http://${(await res.text()).trim()}:3000`, source: "auto-detected" }
  } catch {
    return { url: null, source: "none" }
  }
}

/** Returns the Discord webhook URL: config file takes priority, then env var */
export function getDiscordWebhookUrl(): string | undefined {
  const config = readConfig()
  return config.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL || undefined
}

export function getSpectraAnalyzeUrl(): string | undefined {
  const config = readConfig()
  return config.spectraAnalyzeUrl || process.env.SPECTRA_ANALYZE_URL || undefined
}

export function getSpectraAnalyzeToken(): string | undefined {
  const config = readConfig()
  return config.spectraAnalyzeToken || process.env.SPECTRA_ANALYZE_TOKEN || undefined
}
