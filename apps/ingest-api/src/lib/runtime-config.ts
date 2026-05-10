import fs from 'node:fs'
import path from 'node:path'

interface AlertEnabledTypes {
  threatScore?: boolean
  multiService?: boolean
  authBurst?: boolean
  postAuth?: boolean
  attackChain?: boolean
  sensorOffline?: boolean
}

interface RuntimeConfig {
  discordWebhookUrl?: string
  alertMinLevel?: 'critical' | 'high'
  alertCooldownMinutes?: number
  alertEnabledTypes?: AlertEnabledTypes
  reportIntervalHours?: number
}

export interface ResolvedAlertConfig {
  minLevel: 'critical' | 'high'
  cooldownMs: number
  types: Required<AlertEnabledTypes>
  reportIntervalHours: number
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

export function getAlertConfig(): ResolvedAlertConfig {
  const config = readConfig()
  const types = config.alertEnabledTypes ?? {}
  const cooldownMinutes = config.alertCooldownMinutes ?? 60
  return {
    minLevel: config.alertMinLevel ?? 'critical',
    cooldownMs: cooldownMinutes * 60 * 1000,
    types: {
      threatScore: types.threatScore ?? true,
      multiService: types.multiService ?? true,
      authBurst: types.authBurst ?? true,
      postAuth: types.postAuth ?? true,
      attackChain: types.attackChain ?? true,
      sensorOffline: types.sensorOffline ?? true,
    },
    reportIntervalHours: config.reportIntervalHours ?? 8,
  }
}
