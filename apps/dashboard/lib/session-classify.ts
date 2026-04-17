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
  hassh?: string
  clientVersion?: string
}

export interface Classification {
  label: string
  icon: LucideIcon
  color: string
  bg: string
  summary: string
}

export function classify(s: SessionItem): Classification {
  const logged = s.loginSuccess === true
  const n = s.eventCount

  if (!logged) {
    if (n > 30)
      return {
        label: "Brute-force",
        icon: Cpu,
        color: "text-orange-400",
        bg: "bg-orange-400/15",
        summary: `${Math.max(0, n - 3)} auth attempts · acceso denegado`,
      }
    if (n > 8)
      return {
        label: "Bot scan",
        icon: Cpu,
        color: "text-yellow-400",
        bg: "bg-yellow-400/15",
        summary: `Intentó ${Math.max(0, n - 3)} credenciales · sin éxito`,
      }
    return {
      label: "Scanner",
      icon: Crosshair,
      color: "text-muted-foreground",
      bg: "bg-secondary",
      summary: "Sondeó el puerto · sin autenticación exitosa",
    }
  }

  if (n > 40)
    return {
      label: "Malware dropper",
      icon: Download,
      color: "text-destructive",
      bg: "bg-destructive/15",
      summary: `Acceso exitoso · ${n - 5} eventos · actividad extensa`,
    }
  if (n > 20)
    return {
      label: "Interactive",
      icon: Eye,
      color: "text-red-400",
      bg: "bg-red-400/15",
      summary: `Acceso exitoso · ${n - 5} comandos ejecutados`,
    }
  if (n > 8)
    return {
      label: "Recon",
      icon: Eye,
      color: "text-blue-400",
      bg: "bg-blue-400/15",
      summary: `Acceso exitoso · reconocimiento básico`,
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
  credentials: Array<{ username: string; password: string }>
  firstSeen: string
  lastSeen: string
  clientVersions: string[]
  sessions: SessionItem[]
}

export function groupScans(scans: SessionItem[]): ScanGroup[] {
  const map = new Map<string, ScanGroup>()

  for (const s of scans) {
    if (!map.has(s.srcIp)) {
      map.set(s.srcIp, {
        srcIp: s.srcIp,
        country: s.country,
        countryName: s.countryName,
        attempts: 0,
        credentials: [],
        firstSeen: s.startTime,
        lastSeen: s.startTime,
        clientVersions: [],
        sessions: [],
      })
    }
    const g = map.get(s.srcIp)!
    g.attempts++
    g.sessions.push(s)
    if (new Date(s.startTime) < new Date(g.firstSeen)) g.firstSeen = s.startTime
    if (new Date(s.startTime) > new Date(g.lastSeen)) g.lastSeen = s.startTime
    if (s.username && s.password) {
      const exists = g.credentials.some(
        (c) => c.username === s.username && c.password === s.password,
      )
      if (!exists) g.credentials.push({ username: s.username, password: s.password })
    }
    if (s.clientVersion && !g.clientVersions.includes(s.clientVersion)) {
      g.clientVersions.push(s.clientVersion)
    }
  }

  return [...map.values()].sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
  )
}
