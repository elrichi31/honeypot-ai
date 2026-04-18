import { Cpu, Eye, Download, Shield, Crosshair, type LucideIcon } from "lucide-react"

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

  if (!loggedIn) {
    if (authAttempts === 0 && session.eventCount <= 3) {
      return {
        label: "Port probe",
        icon: Crosshair,
        color: "text-slate-400",
        bg: "bg-slate-400/10",
        summary: "Abri\u00f3 y cerr\u00f3 r\u00e1pido sin probar credenciales",
      }
    }

    if (authAttempts >= 30 || authRate >= 20) {
      return {
        label: "Burst brute-force",
        icon: Cpu,
        color: "text-orange-400",
        bg: "bg-orange-400/15",
        summary: `${authAttempts} intentos en r\u00e1faga · acceso denegado`,
      }
    }

    if (authAttempts >= 12 && duration >= 1800) {
      return {
        label: "Slow brute-force",
        icon: Cpu,
        color: "text-yellow-400",
        bg: "bg-yellow-400/15",
        summary: `${authAttempts} credenciales durante ${Math.round(duration / 60)} min`,
      }
    }

    if (authAttempts >= 8) {
      return {
        label: "Credential spray",
        icon: Cpu,
        color: "text-amber-400",
        bg: "bg-amber-400/15",
        summary: `${authAttempts} credenciales probadas · automatizado`,
      }
    }

    return {
      label: "Scanner",
      icon: Crosshair,
      color: "text-muted-foreground",
      bg: "bg-secondary",
      summary: "Reconocimiento breve · sin autenticaci\u00f3n exitosa",
    }
  }

  if (commandCount > 20 || duration >= 1800) {
    return {
      label: "Malware dropper",
      icon: Download,
      color: "text-destructive",
      bg: "bg-destructive/15",
      summary: `Acceso exitoso · ${commandCount} comandos · actividad extensa`,
    }
  }

  if (commandCount > 8) {
    return {
      label: "Interactive",
      icon: Eye,
      color: "text-red-400",
      bg: "bg-red-400/15",
      summary: `Acceso exitoso · ${commandCount} comandos ejecutados`,
    }
  }

  if (commandCount > 0) {
    return {
      label: "Recon",
      icon: Eye,
      color: "text-blue-400",
      bg: "bg-blue-400/15",
      summary: "Acceso exitoso · reconocimiento b\u00e1sico",
    }
  }

  return {
    label: "Login only",
    icon: Shield,
    color: "text-green-400",
    bg: "bg-green-400/15",
    summary: "Acceso exitoso · sin actividad post-login",
  }
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

    if (new Date(session.startTime) < new Date(group.firstSeen)) group.firstSeen = session.startTime
    if (new Date(session.startTime) > new Date(group.lastSeen)) group.lastSeen = session.startTime

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
