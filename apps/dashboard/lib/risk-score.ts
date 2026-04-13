import type { HoneypotEvent, ApiSession } from "./api"

export type RiskLevel = "Low" | "Medium" | "High" | "Critical"

export type ClassificationLabel =
  | "brute-force bot"
  | "opportunistic scanner"
  | "interactive operator"
  | "malware dropper"
  | "recon-only"
  | "credential stuffing"

export interface RiskFactors {
  loginSuccess: boolean
  commandCount: number
  hasDownload: boolean
  downloadUrls: string[]
  hasBinaryExec: boolean
  hasPersistence: boolean
  persistenceCommands: string[]
  hasRecon: boolean
  reconCommands: string[]
  hasLateralMovement: boolean
  authAttempts: number
  uniqueCredentials: number
}

export interface RiskResult {
  score: number           // 0–100
  level: RiskLevel
  factors: RiskFactors
  breakdown: { label: string; points: number }[]
}

// ---------- Patterns ----------

const DOWNLOAD_RE = /\b(wget|curl|tftp|scp|rsync|ftp)\s/i

const BINARY_EXEC_RE =
  /\b(chmod\s+[\+0-9]*x|\.\/[^\s]+|bash\s+-c|sh\s+-c|python\s+-c|perl\s+-e|exec\s+\/)/i

const PERSISTENCE_PATTERNS = [
  /crontab\s/i,
  /cron\./i,
  /\/etc\/rc\./i,
  /\.bashrc/i,
  /\.profile/i,
  /\.bash_profile/i,
  /systemctl\s+(enable|start)/i,
  /\/etc\/init\.d\//i,
  /at\s+now/i,
  /echo.*>>.*\/(etc|root|home)/i,
]

const RECON_PATTERNS = [
  /\bcat\s+\/etc\/passwd\b/i,
  /\bcat\s+\/etc\/shadow\b/i,
  /\bid\b/i,
  /\bwhoami\b/i,
  /\buname\b/i,
  /\bifconfig\b|\bip\s+a\b/i,
  /\bnetstat\b|\bss\b/i,
  /\bls\s+\//i,
  /\bps\s+(aux|ef|-ef)\b/i,
  /\bfind\s+\//i,
  /\benv\b/i,
  /\/proc\/cpuinfo/i,
]

const LATERAL_PATTERNS = [
  /\bssh\s+/i,
  /\bscp\s+.*@/i,
  /\bnmap\b/i,
  /\bmasscan\b/i,
  /\bzmap\b/i,
]

// ---------- Analyzer ----------

export function analyzeRisk(
  session: Pick<ApiSession, "loginSuccess" | "srcIp">,
  events: HoneypotEvent[]
): RiskResult {
  const commands = events
    .filter((e) => e.eventType === "command.input" && e.command)
    .map((e) => e.command as string)

  const auths = events.filter(
    (e) => e.eventType === "auth.success" || e.eventType === "auth.failed"
  )

  const uniqueCreds = new Set(
    auths.map((e) => `${e.username}:${e.password}`)
  ).size

  const downloadCmds = commands.filter((c) => DOWNLOAD_RE.test(c))
  const downloadUrls = downloadCmds.flatMap((c) => {
    const m = c.match(/(https?:\/\/[^\s]+|ftp:\/\/[^\s]+|\d+\.\d+\.\d+\.\d+[^\s]*)/g)
    return m ?? []
  })

  const binaryExecCmds = commands.filter((c) => BINARY_EXEC_RE.test(c))
  const persistenceCmds = commands.filter((c) =>
    PERSISTENCE_PATTERNS.some((p) => p.test(c))
  )
  const reconCmds = commands.filter((c) => RECON_PATTERNS.some((p) => p.test(c)))
  const lateralCmds = commands.filter((c) =>
    LATERAL_PATTERNS.some((p) => p.test(c))
  )

  const factors: RiskFactors = {
    loginSuccess: !!session.loginSuccess,
    commandCount: commands.length,
    hasDownload: downloadCmds.length > 0,
    downloadUrls,
    hasBinaryExec: binaryExecCmds.length > 0,
    hasPersistence: persistenceCmds.length > 0,
    persistenceCommands: persistenceCmds,
    hasRecon: reconCmds.length > 0,
    reconCommands: reconCmds,
    hasLateralMovement: lateralCmds.length > 0,
    authAttempts: auths.length,
    uniqueCredentials: uniqueCreds,
  }

  // ---------- Scoring ----------
  const breakdown: { label: string; points: number }[] = []

  const add = (label: string, points: number) => {
    if (points > 0) breakdown.push({ label, points })
    return points
  }

  let score = 0
  score += add("Login exitoso", factors.loginSuccess ? 35 : 0)
  score += add(
    `${commands.length} comandos ejecutados`,
    commands.length >= 30 ? 15 : commands.length >= 10 ? 8 : commands.length >= 3 ? 3 : 0
  )
  score += add("Descarga de archivos (wget/curl)", factors.hasDownload ? 20 : 0)
  score += add("Ejecución de binario descargado", factors.hasBinaryExec ? 20 : 0)
  score += add("Intento de persistencia", factors.hasPersistence ? 30 : 0)
  score += add("Reconocimiento del sistema", factors.hasRecon ? 10 : 0)
  score += add("Movimiento lateral", factors.hasLateralMovement ? 15 : 0)
  score += add(
    `${auths.length} intentos de autenticación`,
    auths.length >= 50 ? 10 : auths.length >= 10 ? 5 : 0
  )

  const capped = Math.min(score, 100)

  const level: RiskLevel =
    capped >= 75 ? "Critical" : capped >= 50 ? "High" : capped >= 25 ? "Medium" : "Low"

  return { score: capped, level, factors, breakdown }
}

// ---------- Pre-classify (used as hint for AI) ----------

export function preClassify(factors: RiskFactors): ClassificationLabel {
  if (factors.hasPersistence || factors.hasBinaryExec) return "malware dropper"
  if (factors.loginSuccess && factors.commandCount > 5) return "interactive operator"
  if (factors.hasDownload) return "malware dropper"
  if (factors.hasRecon && factors.commandCount <= 5) return "recon-only"
  if (factors.uniqueCredentials > 10) return "brute-force bot"
  if (factors.authAttempts > 20 && !factors.loginSuccess) return "credential stuffing"
  if (factors.commandCount === 0) return "opportunistic scanner"
  return "opportunistic scanner"
}
