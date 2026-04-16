"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
  ChevronDown, ChevronRight, Terminal, Clock, User, Key,
  Loader2, ExternalLink, Search, Filter, ShieldX, Shield,
  Download, Eye, Cpu, Crosshair, X, ScanLine,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { EventTimeline } from "./event-timeline"
import type { HoneypotEvent } from "@/lib/api"

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface SessionsTableProps {
  sessions: SessionItem[]
  showAll?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("")
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

// ─── Classification ───────────────────────────────────────────────────────────

type Classification = {
  label: string
  icon: typeof Cpu
  color: string
  bg: string
  summary: string
}

function classify(s: SessionItem): Classification {
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

// ─── Scan grouping ────────────────────────────────────────────────────────────

interface ScanGroup {
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

function groupScans(scans: SessionItem[]): ScanGroup[] {
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

// ─── Filter state ─────────────────────────────────────────────────────────────

interface Filters {
  search: string
  country: string
  classification: string
}

// ─── Session row ──────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: SessionItem }) {
  const [expanded, setExpanded] = useState(false)
  const [events, setEvents] = useState<HoneypotEvent[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!expanded || events !== null) return
    setLoading(true)
    fetch(`/api/sessions/${session.id}`)
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .finally(() => setLoading(false))
  }, [expanded, events, session.id])

  const cls = classify(session)
  const Icon = cls.icon

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
      >
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">
              {session.srcIp}
            </span>
            {session.country && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{countryFlag(session.country)}</span>
                <span>{session.countryName}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
              <ShieldX className="h-3 w-3" /> Comprometido
            </span>
            <span className={cn("inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium", cls.bg, cls.color)}>
              <Icon className="h-3 w-3" />
              {cls.label}
            </span>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">{cls.summary}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(session.startTime), { addSuffix: true })}
            </span>
            {session.duration !== null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(session.duration)}
              </span>
            )}
            {session.username && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span className="font-mono">{session.username}</span>
              </span>
            )}
            {session.password && (
              <span className="flex items-center gap-1">
                <Key className="h-3 w-3" />
                <span className="font-mono">{session.password}</span>
              </span>
            )}
            {session.clientVersion && (
              <span className="hidden xl:flex items-center gap-1 max-w-[200px] truncate">
                <Terminal className="h-3 w-3 shrink-0" />
                {session.clientVersion.replace("SSH-2.0-", "")}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Link
            href={`/sessions/${session.id}`}
            className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            Replay
          </Link>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-secondary/20 p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : events && events.length > 0 ? (
            <EventTimeline events={events} />
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">Sin eventos registrados.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Scan group row ───────────────────────────────────────────────────────────

function ScanGroupRow({ group }: { group: ScanGroup }) {
  const [expanded, setExpanded] = useState(false)

  const hasCredentials = group.credentials.length > 0
  const CRED_PREVIEW = 5

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
      >
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: IP + country + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">
              {group.srcIp}
            </span>
            {group.country && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{countryFlag(group.country)}</span>
                <span>{group.countryName}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" /> Bloqueado
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <ScanLine className="h-3 w-3" />
              {group.attempts} {group.attempts === 1 ? "intento" : "intentos"}
            </span>
            {hasCredentials && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/15 px-2 py-0.5 text-xs font-medium text-yellow-400">
                <Key className="h-3 w-3" />
                {group.credentials.length} {group.credentials.length === 1 ? "credencial" : "credenciales"}
              </span>
            )}
          </div>

          {/* Row 2: last seen + client versions */}
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(group.lastSeen), { addSuffix: true })}
            </span>
            {group.clientVersions.length > 0 && (
              <span className="hidden xl:flex items-center gap-1 max-w-[280px] truncate">
                <Terminal className="h-3 w-3 shrink-0" />
                {group.clientVersions[0].replace("SSH-2.0-", "").replace("SSH-1.5-", "")}
                {group.clientVersions.length > 1 && (
                  <span className="text-muted-foreground/60">+{group.clientVersions.length - 1}</span>
                )}
              </span>
            )}
          </div>

          {/* Credential pills preview (collapsed) */}
          {!expanded && hasCredentials && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {group.credentials.slice(0, CRED_PREVIEW).map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-foreground/80"
                >
                  <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                  {c.username}
                  <span className="text-muted-foreground/50">·</span>
                  <Key className="h-3 w-3 shrink-0 text-muted-foreground" />
                  {c.password}
                </span>
              ))}
              {group.credentials.length > CRED_PREVIEW && (
                <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  +{group.credentials.length - CRED_PREVIEW} más
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      {/* Expanded: full credential list + individual attempts */}
      {expanded && (
        <div className="border-t border-border bg-secondary/20 p-4 space-y-4">
          {hasCredentials && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Credenciales probadas ({group.credentials.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.credentials.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md bg-card border border-border px-2 py-1 font-mono text-xs text-foreground"
                  >
                    <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                    {c.username}
                    <span className="text-muted-foreground/50 mx-0.5">:</span>
                    <Key className="h-3 w-3 shrink-0 text-muted-foreground" />
                    {c.password}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Intentos individuales ({group.sessions.length})
            </p>
            <div className="space-y-1">
              {group.sessions
                .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                .map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg bg-card border border-border px-3 py-2 text-xs"
                  >
                    <span className="text-muted-foreground w-32 shrink-0">
                      {formatDistanceToNow(new Date(s.startTime), { addSuffix: true })}
                    </span>
                    {s.duration !== null && (
                      <span className="text-muted-foreground w-12 shrink-0">{formatDuration(s.duration)}</span>
                    )}
                    {s.username ? (
                      <span className="flex items-center gap-1 font-mono text-foreground/80">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {s.username}
                        {s.password && (
                          <>
                            <span className="text-muted-foreground/50 mx-0.5">:</span>
                            <Key className="h-3 w-3 text-muted-foreground" />
                            {s.password}
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">sin credenciales</span>
                    )}
                    {s.clientVersion && (
                      <span className="hidden xl:block ml-auto text-muted-foreground/60 truncate max-w-[200px]">
                        {s.clientVersion.replace("SSH-2.0-", "").replace("SSH-1.5-", "")}
                      </span>
                    )}
                    <Link
                      href={`/sessions/${s.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Replay
                    </Link>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main table ───────────────────────────────────────────────────────────────

export function SessionsTable({ sessions, showAll = false }: SessionsTableProps) {
  const [tab, setTab] = useState<"sessions" | "scans">("sessions")
  const [filters, setFilters] = useState<Filters>({
    search: "",
    country: "",
    classification: "",
  })

  const activeSessions = useMemo(() => sessions.filter((s) => s.loginSuccess === true), [sessions])
  const scanSessions = useMemo(() => sessions.filter((s) => s.loginSuccess !== true), [sessions])
  const scanGroups = useMemo(() => groupScans(scanSessions), [scanSessions])

  const availableCountries = useMemo(() => {
    const source = tab === "sessions" ? activeSessions : scanSessions
    const seen = new Map<string, string>()
    for (const s of source) {
      if (s.country && s.countryName && !seen.has(s.country)) {
        seen.set(s.country, s.countryName)
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [tab, activeSessions, scanSessions])

  const availableClasses = useMemo(() => {
    const source = tab === "sessions" ? activeSessions : scanSessions
    const seen = new Set<string>()
    for (const s of source) seen.add(classify(s).label)
    return [...seen].sort()
  }, [tab, activeSessions, scanSessions])

  const filteredSessions = useMemo(() => {
    return activeSessions.filter((s) => {
      if (filters.search && !s.srcIp.includes(filters.search)) return false
      if (filters.country && s.country !== filters.country) return false
      if (filters.classification && classify(s).label !== filters.classification) return false
      return true
    })
  }, [activeSessions, filters])

  const filteredGroups = useMemo(() => {
    return scanGroups.filter((g) => {
      if (filters.search && !g.srcIp.includes(filters.search)) return false
      if (filters.country && g.country !== filters.country) return false
      return true
    })
  }, [scanGroups, filters])

  function clearFilter(key: keyof Filters) {
    setFilters((f) => ({ ...f, [key]: "" }))
  }

  const activeFilters = [
    filters.search && `IP: ${filters.search}`,
    filters.country && filters.country,
    filters.classification,
  ].filter(Boolean)

  // Overview mode: show a compact preview of active sessions only
  if (!showAll) {
    const preview = activeSessions.slice(0, 5)
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold text-foreground">Sesiones recientes</h3>
          <p className="text-sm text-muted-foreground">
            {activeSessions.length} sesiones comprometidas · {scanGroups.length} IPs escanearon
          </p>
        </div>
        <div className="divide-y divide-border">
          {preview.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Sin sesiones activas.</p>
          ) : (
            preview.map((s) => <SessionRow key={s.id} session={s} />)
          )}
        </div>
        {sessions.length > 5 && (
          <div className="border-t border-border p-4 text-center">
            <Link href="/sessions" className="text-sm text-accent hover:underline">
              Ver todas las {sessions.length} sesiones →
            </Link>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="border-b border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Sessions</h3>
            <p className="text-xs text-muted-foreground">
              {activeSessions.length} comprometidas · {scanGroups.length} IPs escanearon ({scanSessions.length} intentos)
            </p>
          </div>
          <Filter className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-secondary p-1 w-fit">
          <button
            onClick={() => { setTab("sessions"); setFilters({ search: "", country: "", classification: "" }) }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "sessions"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ShieldX className="h-3.5 w-3.5" />
            Sesiones
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              tab === "sessions" ? "bg-destructive/20 text-destructive" : "bg-secondary text-muted-foreground",
            )}>
              {activeSessions.length}
            </span>
          </button>
          <button
            onClick={() => { setTab("scans"); setFilters({ search: "", country: "", classification: "" }) }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "scans"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ScanLine className="h-3.5 w-3.5" />
            Escaneos
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              tab === "scans" ? "bg-secondary text-foreground" : "bg-secondary text-muted-foreground",
            )}>
              {scanGroups.length}
            </span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar IP..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="h-8 rounded-lg border border-border bg-secondary pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <select
            value={filters.country}
            onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}
            className="h-8 rounded-lg border border-border bg-secondary px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">🌍 Todos los países</option>
            {availableCountries.map(([code, name]) => (
              <option key={code} value={code}>
                {countryFlag(code)} {name}
              </option>
            ))}
          </select>

          {tab === "sessions" && (
            <select
              value={filters.classification}
              onChange={(e) => setFilters((f) => ({ ...f, classification: e.target.value }))}
              className="h-8 rounded-lg border border-border bg-secondary px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">⚡ Todos los tipos</option>
              {availableClasses.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>

        {/* Active filter pills */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {filters.search && (
              <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                IP: {filters.search}
                <button onClick={() => clearFilter("search")}><X className="h-3 w-3" /></button>
              </span>
            )}
            {filters.country && (
              <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                {countryFlag(filters.country)} {filters.country}
                <button onClick={() => clearFilter("country")}><X className="h-3 w-3" /></button>
              </span>
            )}
            {filters.classification && (
              <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                {filters.classification}
                <button onClick={() => clearFilter("classification")}><X className="h-3 w-3" /></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {tab === "sessions" ? (
          filteredSessions.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No hay sesiones que coincidan con los filtros.
            </p>
          ) : (
            filteredSessions.map((s) => <SessionRow key={s.id} session={s} />)
          )
        ) : (
          filteredGroups.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No hay escaneos que coincidan con los filtros.
            </p>
          ) : (
            filteredGroups.map((g) => <ScanGroupRow key={g.srcIp} group={g} />)
          )
        )}
      </div>
    </div>
  )
}
