"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
  ChevronDown, ChevronRight, Terminal, Clock, User, Key,
  Loader2, ExternalLink, Search, Filter, ShieldX, Shield,
  Download, Eye, Cpu, Crosshair, X,
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

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
// eventCount includes connect/auth/command/close events combined

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

  // Logged in
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

// ─── Filter state ─────────────────────────────────────────────────────────────

interface Filters {
  search: string
  country: string
  loginStatus: "all" | "success" | "failed"
  classification: string
}

// ─── Row component ────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: SessionItem }) {
  const [expanded, setExpanded] = useState(false)
  const [events, setEvents] = useState<HoneypotEvent[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!expanded || events !== null) return
    setLoading(true)
    fetch(`${API_URL}/sessions/${session.id}`)
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
        {/* Expand icon */}
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: IP + country + classification */}
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

            {/* Login badge */}
            {session.loginSuccess === true ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
                <ShieldX className="h-3 w-3" /> Comprometido
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" /> Bloqueado
              </span>
            )}

            {/* Classification */}
            <span className={cn("inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium", cls.bg, cls.color)}>
              <Icon className="h-3 w-3" />
              {cls.label}
            </span>
          </div>

          {/* Row 2: What happened summary */}
          <p className="mt-1 text-xs text-muted-foreground">{cls.summary}</p>

          {/* Row 3: metadata */}
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

        {/* Right side */}
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

      {/* Expanded timeline */}
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

// ─── Main table ───────────────────────────────────────────────────────────────

export function SessionsTable({ sessions, showAll = false }: SessionsTableProps) {
  const [filters, setFilters] = useState<Filters>({
    search: "",
    country: "",
    loginStatus: "all",
    classification: "",
  })

  // Compute available countries from data
  const availableCountries = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of sessions) {
      if (s.country && s.countryName && !seen.has(s.country)) {
        seen.set(s.country, s.countryName)
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [sessions])

  const availableClasses = useMemo(() => {
    const seen = new Set<string>()
    for (const s of sessions) seen.add(classify(s).label)
    return [...seen].sort()
  }, [sessions])

  // Apply filters
  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (filters.search && !s.srcIp.includes(filters.search)) return false
      if (filters.country && s.country !== filters.country) return false
      if (filters.loginStatus === "success" && s.loginSuccess !== true) return false
      if (filters.loginStatus === "failed" && s.loginSuccess === true) return false
      if (filters.classification && classify(s).label !== filters.classification) return false
      return true
    })
  }, [sessions, filters])

  const displayed = showAll ? filtered : filtered.slice(0, 5)

  const activeFilters = [
    filters.search && `IP: ${filters.search}`,
    filters.country && filters.country,
    filters.loginStatus !== "all" && (filters.loginStatus === "success" ? "Comprometidos" : "Bloqueados"),
    filters.classification,
  ].filter(Boolean)

  function clearFilter(key: keyof Filters) {
    setFilters((f) => ({ ...f, [key]: key === "loginStatus" ? "all" : "" }))
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header + filters (only in full/showAll mode) */}
      {showAll ? (
        <div className="border-b border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Sessions</h3>
              <p className="text-xs text-muted-foreground">
                {filtered.length} de {sessions.length} sesiones
              </p>
            </div>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap gap-2">
            {/* IP search */}
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

            {/* Country */}
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

            {/* Login status */}
            <select
              value={filters.loginStatus}
              onChange={(e) => setFilters((f) => ({ ...f, loginStatus: e.target.value as Filters["loginStatus"] }))}
              className="h-8 rounded-lg border border-border bg-secondary px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">🔐 Todos</option>
              <option value="success">🔴 Comprometidos</option>
              <option value="failed">✅ Bloqueados</option>
            </select>

            {/* Classification */}
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
              {filters.loginStatus !== "all" && (
                <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                  {filters.loginStatus === "success" ? "Comprometidos" : "Bloqueados"}
                  <button onClick={() => clearFilter("loginStatus")}><X className="h-3 w-3" /></button>
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
      ) : (
        <div className="border-b border-border p-4">
          <h3 className="font-semibold text-foreground">Recent Sessions</h3>
          <p className="text-sm text-muted-foreground">Click a session to expand its event timeline</p>
        </div>
      )}

      {/* Rows */}
      <div className="divide-y divide-border">
        {displayed.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No hay sesiones que coincidan con los filtros.
          </p>
        ) : (
          displayed.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))
        )}
      </div>

      {/* Footer: view all link (overview mode) */}
      {!showAll && sessions.length > 5 && (
        <div className="border-t border-border p-4 text-center">
          <Link href="/sessions" className="text-sm text-accent hover:underline">
            Ver todas las {sessions.length} sesiones →
          </Link>
        </div>
      )}
    </div>
  )
}
