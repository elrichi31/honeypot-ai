import { Cpu, Eye, Download, Shield, Crosshair, KeyRound, Ghost, Container, Database, Coins, type LucideIcon } from "lucide-react"

export interface SessionItem {
  id: string
  srcIp: string
  country: string | null
  countryName: string | null
  startTime: string
  endTime?: string
  duration: number | null
  username?: string
  password?: string
  loginSuccess: boolean | null
  eventCount: number
  authAttemptCount: number
  commandCount: number
  hassh?: string
  clientVersion?: string
  sessionType?: 'bot' | 'human' | 'unknown'
  threatTags?: string[]
}

export interface Classification {
  label: string
  icon: LucideIcon
  color: string
  bg: string
  summary: string
}

function authRatePerMinute(session: SessionItem): number {
  if (session.authAttemptCount <= 0) return 0
  if (!session.duration || session.duration <= 0) return session.authAttemptCount
  return session.authAttemptCount / Math.max(session.duration / 60, 1)
}

export function classify(session: SessionItem): Classification {
  const loggedIn = session.loginSuccess === true
  const duration = session.duration ?? 0
  const authAttempts = session.authAttemptCount
  const commandCount = session.commandCount
  const authRate = authRatePerMinute(session)
  const tags = session.threatTags ?? []

  // ── Threat-tag labels take priority over generic heuristics ──────────────
  const TAG_CLASSIFICATIONS: Array<{ tag: string; result: Classification }> = [
    { tag: 'ssh_backdoor',      result: { label: "SSH Backdoor",     icon: KeyRound, color: "text-red-500",     bg: "bg-red-500/15",     summary: `Tried to plant a persistent SSH key with chattr +ai` } },
    { tag: 'honeypot_evasion',  result: { label: "Honeypot Evasion", icon: Ghost,    color: "text-purple-400",  bg: "bg-purple-400/15",  summary: `Detected sandbox/honeypot · probed for Telegram/SIM data` } },
    { tag: 'container_escape',  result: { label: "Container Escape", icon: Container, color: "text-orange-500", bg: "bg-orange-500/15",  summary: `Tried to detect and escape the container environment` } },
    { tag: 'crypto_mining',     result: { label: "Crypto Miner",     icon: Cpu,      color: "text-yellow-400",  bg: "bg-yellow-400/15",  summary: `Deployed a cryptocurrency miner` } },
    { tag: 'data_exfil',        result: { label: "Data Exfil",       icon: Database, color: "text-red-400",     bg: "bg-red-400/15",     summary: `Tried to exfiltrate system data` } },
    { tag: 'solana_targeting',  result: { label: "Targeted Crypto",  icon: Coins,    color: "text-emerald-400", bg: "bg-emerald-400/15", summary: `Probed for Solana infrastructure (validator, Jito, Firedancer)` } },
  ]

  if (loggedIn) {
    const match = TAG_CLASSIFICATIONS.find(({ tag }) => tags.includes(tag))
    if (match) return match.result
  }

  if (!loggedIn) {
    if (authAttempts === 0 && session.eventCount <= 3) {
      return {
        label: "Port probe",
        icon: Crosshair,
        color: "text-slate-400",
        bg: "bg-slate-400/10",
        summary: "Opened and closed quickly without trying credentials",
      }
    }

    if (authAttempts >= 30 || authRate >= 20) {
      return {
        label: "Burst brute-force",
        icon: Cpu,
        color: "text-orange-400",
        bg: "bg-orange-400/15",
        summary: `${authAttempts} burst attempts · access denied`,
      }
    }

    if (authAttempts >= 12 && duration >= 1800) {
      return {
        label: "Slow brute-force",
        icon: Cpu,
        color: "text-yellow-400",
        bg: "bg-yellow-400/15",
        summary: `${authAttempts} credentials over ${Math.round(duration / 60)} min`,
      }
    }

    if (authAttempts >= 8) {
      return {
        label: "Credential spray",
        icon: Cpu,
        color: "text-amber-400",
        bg: "bg-amber-400/15",
        summary: `${authAttempts} credentials tried · automated`,
      }
    }

    return {
      label: "Scanner",
      icon: Crosshair,
      color: "text-muted-foreground",
      bg: "bg-secondary",
      summary: "Brief recon · no successful authentication",
    }
  }

  // Bot script: DB-tagged as bot, or logged in but bailed out too fast to be human
  // Real humans need at least 20 s to type commands; automated scripts run in <5 s
  const isAutomated = session.sessionType === 'bot' || duration < 20

  if (duration >= 1800 || (commandCount > 20 && !isAutomated)) {
    return {
      label: "Malware dropper",
      icon: Download,
      color: "text-destructive",
      bg: "bg-destructive/15",
      summary: `Successful access · ${commandCount} commands · extensive activity`,
    }
  }

  if (commandCount > 8 && !isAutomated) {
    return {
      label: "Interactive",
      icon: Eye,
      color: "text-red-400",
      bg: "bg-red-400/15",
      summary: `Successful access · ${commandCount} commands executed`,
    }
  }

  if (commandCount > 0 && !isAutomated) {
    return {
      label: "Recon",
      icon: Eye,
      color: "text-blue-400",
      bg: "bg-blue-400/15",
      summary: "Successful access · basic reconnaissance",
    }
  }

  if (commandCount > 0) {
    return {
      label: "Bot Script",
      icon: Cpu,
      color: "text-slate-400",
      bg: "bg-slate-400/10",
      summary: `Automated script · ${commandCount} cmd in ${duration}s`,
    }
  }

  return {
    label: "Login only",
    icon: Shield,
    color: "text-green-400",
    bg: "bg-green-400/15",
    summary: "Successful access · no post-login activity",
  }
}

export interface IpGroup {
  srcIp: string
  country: string | null
  countryName: string | null
  sessions: SessionItem[]
  firstSeen: string
  lastSeen: string
  worstClassification: Classification
  hasCommands: boolean
  sessionTypes: Set<string>
}

function updateTimeWindow(group: { firstSeen: string; lastSeen: string }, ts: string): void {
  if (ts < group.firstSeen) group.firstSeen = ts
  if (ts > group.lastSeen) group.lastSeen = ts
}

export function groupSessionsByIp(sessions: SessionItem[]): IpGroup[] {
  const map = new Map<string, IpGroup>()

  for (const session of sessions) {
    if (!map.has(session.srcIp)) {
      map.set(session.srcIp, {
        srcIp: session.srcIp,
        country: session.country,
        countryName: session.countryName,
        sessions: [],
        firstSeen: session.startTime,
        lastSeen: session.startTime,
        worstClassification: classify(session),
        hasCommands: false,
        sessionTypes: new Set(),
      })
    }

    const group = map.get(session.srcIp)!
    group.sessions.push(session)
    if (session.sessionType) group.sessionTypes.add(session.sessionType)
    if (session.commandCount > 0) group.hasCommands = true

    updateTimeWindow(group, session.startTime)

    const cls = classify(session)
    group.worstClassification = worstOf(group.worstClassification, cls)
  }

  return [...map.values()].sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
  )
}

const SEVERITY_ORDER = [
  "Malware dropper",
  "Container Escape",
  "Crypto Miner",
  "Data Exfil",
  "Targeted Crypto",
  "SSH Backdoor",
  "Honeypot Evasion",
  "Burst brute-force",
  "Slow brute-force",
  "Interactive",
  "Credential spray",
  "Bot Script",
  "Recon",
  "Scanner",
  "Port probe",
  "Login only",
]

function worstOf(a: Classification, b: Classification): Classification {
  const ai = SEVERITY_ORDER.indexOf(a.label)
  const bi = SEVERITY_ORDER.indexOf(b.label)
  if (ai === -1) return b
  if (bi === -1) return a
  return ai <= bi ? a : b
}

export interface ScanGroup {
  srcIp: string
  country: string | null
  countryName: string | null
  attempts: number
  authAttempts: number
  commandCount: number
  credentials: Array<{ username: string; password: string }>
  firstSeen: string
  lastSeen: string
  spanSec: number
  clientVersions: string[]
  sessions: SessionItem[]
  botCount: number
  isBot: boolean
}

export function groupScans(scans: SessionItem[]): ScanGroup[] {
  const map = new Map<string, ScanGroup>()

  for (const session of scans) {
    if (!map.has(session.srcIp)) {
      map.set(session.srcIp, {
        srcIp: session.srcIp,
        country: session.country,
        countryName: session.countryName,
        attempts: 0,
        authAttempts: 0,
        commandCount: 0,
        credentials: [],
        firstSeen: session.startTime,
        lastSeen: session.startTime,
        spanSec: 0,
        clientVersions: [],
        sessions: [],
        botCount: 0,
        isBot: false,
      })
    }

    const group = map.get(session.srcIp)!
    group.attempts++
    group.authAttempts += session.authAttemptCount
    group.commandCount += session.commandCount
    group.sessions.push(session)
    if (session.sessionType === 'bot') group.botCount++

    updateTimeWindow(group, session.startTime)

    group.spanSec = Math.max(
      0,
      Math.round((new Date(group.lastSeen).getTime() - new Date(group.firstSeen).getTime()) / 1000),
    )

    if (session.username && session.password) {
      const exists = group.credentials.some(
        (credential) =>
          credential.username === session.username && credential.password === session.password,
      )
      if (!exists) {
        group.credentials.push({ username: session.username, password: session.password })
      }
    }

    if (session.clientVersion && !group.clientVersions.includes(session.clientVersion)) {
      group.clientVersions.push(session.clientVersion)
    }
  }

  return [...map.values()]
    .map(group => ({
      ...group,
      isBot: group.attempts > 0 && group.botCount / group.attempts >= 0.6,
    }))
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
}
