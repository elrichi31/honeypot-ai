"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Filter, Search, ShieldX, ScanLine, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { countryFlag } from "@/lib/formatting"
import { classify, groupScans, type SessionItem } from "@/lib/session-classify"
import { SessionRow } from "./session-row"
import { ScanGroupRow } from "./scan-group-row"

export type { SessionItem }

interface SessionsTableProps {
  sessions: SessionItem[]
  showAll?: boolean
}

interface Filters {
  search: string
  country: string
  classification: string
}

export function SessionsTable({ sessions, showAll = false }: SessionsTableProps) {
  const [tab, setTab] = useState<"sessions" | "scans">("sessions")
  const [filters, setFilters] = useState<Filters>({ search: "", country: "", classification: "" })

  const activeSessions = useMemo(() => sessions.filter((s) => s.loginSuccess === true), [sessions])
  const scanSessions   = useMemo(() => sessions.filter((s) => s.loginSuccess !== true), [sessions])
  const scanGroups     = useMemo(() => groupScans(scanSessions), [scanSessions])

  const availableCountries = useMemo(() => {
    const source = tab === "sessions" ? activeSessions : scanSessions
    const seen = new Map<string, string>()
    for (const s of source) {
      if (s.country && s.countryName && !seen.has(s.country))
        seen.set(s.country, s.countryName)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [tab, activeSessions, scanSessions])

  const availableClasses = useMemo(() => {
    const source = tab === "sessions" ? activeSessions : scanSessions
    const seen = new Set<string>()
    for (const s of source) seen.add(classify(s).label)
    return [...seen].sort()
  }, [tab, activeSessions, scanSessions])

  const filteredSessions = useMemo(
    () => activeSessions.filter((s) => {
      if (filters.search && !s.srcIp.includes(filters.search)) return false
      if (filters.country && s.country !== filters.country) return false
      if (filters.classification && classify(s).label !== filters.classification) return false
      return true
    }),
    [activeSessions, filters],
  )

  const filteredGroups = useMemo(
    () => scanGroups.filter((g) => {
      if (filters.search && !g.srcIp.includes(filters.search)) return false
      if (filters.country && g.country !== filters.country) return false
      return true
    }),
    [scanGroups, filters],
  )

  function setFilter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }))
  }

  function switchTab(next: "sessions" | "scans") {
    setTab(next)
    setFilters({ search: "", country: "", classification: "" })
  }

  // Compact preview for dashboard overview
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

  const activeFilters = [filters.search, filters.country, filters.classification].filter(Boolean)

  return (
    <div className="rounded-xl border border-border bg-card">
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

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-lg bg-secondary p-1 w-fit">
          {(["sessions", "scans"] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "sessions" ? <ShieldX className="h-3.5 w-3.5" /> : <ScanLine className="h-3.5 w-3.5" />}
              {t === "sessions" ? "Sesiones" : "Escaneos"}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                tab === t
                  ? t === "sessions" ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground"
                  : "bg-secondary text-muted-foreground",
              )}>
                {t === "sessions" ? activeSessions.length : scanGroups.length}
              </span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar IP..."
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="h-8 rounded-lg border border-border bg-secondary pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <select
            value={filters.country}
            onChange={(e) => setFilter("country", e.target.value)}
            className="h-8 rounded-lg border border-border bg-secondary px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">🌍 Todos los países</option>
            {availableCountries.map(([code, name]) => (
              <option key={code} value={code}>{countryFlag(code)} {name}</option>
            ))}
          </select>

          {tab === "sessions" && (
            <select
              value={filters.classification}
              onChange={(e) => setFilter("classification", e.target.value)}
              className="h-8 rounded-lg border border-border bg-secondary px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">⚡ Todos los tipos</option>
              {availableClasses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* Active filter pills */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {filters.search && (
              <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                IP: {filters.search}
                <button onClick={() => setFilter("search", "")}><X className="h-3 w-3" /></button>
              </span>
            )}
            {filters.country && (
              <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                {countryFlag(filters.country)} {filters.country}
                <button onClick={() => setFilter("country", "")}><X className="h-3 w-3" /></button>
              </span>
            )}
            {filters.classification && (
              <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                {filters.classification}
                <button onClick={() => setFilter("classification", "")}><X className="h-3 w-3" /></button>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="divide-y divide-border">
        {tab === "sessions" ? (
          filteredSessions.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No hay sesiones que coincidan con los filtros.</p>
          ) : (
            filteredSessions.map((s) => <SessionRow key={s.id} session={s} />)
          )
        ) : (
          filteredGroups.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No hay escaneos que coincidan con los filtros.</p>
          ) : (
            filteredGroups.map((g) => <ScanGroupRow key={g.srcIp} group={g} />)
          )
        )}
      </div>
    </div>
  )
}
