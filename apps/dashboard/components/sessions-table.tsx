"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Filter, Search, ShieldX, ScanLine, X } from "lucide-react"
import type { PaginationMeta, SessionsSummary } from "@/lib/api"
import { cn } from "@/lib/utils"
import { countryFlag } from "@/lib/formatting"
import { classify, groupScans, type SessionItem } from "@/lib/session-classify-v2"
import { SessionRow } from "./session-row"
import { ScanGroupRow } from "./scan-group-row"
import { TablePagination } from "./table-pagination"

export type { SessionItem }

interface SessionsTableProps {
  sessions: SessionItem[]
  showAll?: boolean
  tab?: "sessions" | "scans"
  searchQuery?: string
  summary?: SessionsSummary
  pagination?: PaginationMeta
}

interface Filters {
  search: string
  country: string
  classification: string
}

export function SessionsTable({
  sessions,
  showAll = false,
  tab = "sessions",
  searchQuery = "",
  summary,
  pagination,
}: SessionsTableProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>({ search: "", country: "", classification: "" })
  const [serverQuery, setServerQuery] = useState(searchQuery)

  useEffect(() => {
    setServerQuery(searchQuery)
  }, [searchQuery])

  const activeSessions = useMemo(() => sessions.filter((session) => session.loginSuccess === true), [sessions])
  const scanSessions = useMemo(() => sessions.filter((session) => session.loginSuccess !== true), [sessions])
  const scanGroups = useMemo(() => groupScans(scanSessions), [scanSessions])

  const availableCountries = useMemo(() => {
    const source = tab === "sessions" ? activeSessions : scanSessions
    const seen = new Map<string, string>()

    for (const session of source) {
      if (session.country && session.countryName && !seen.has(session.country)) {
        seen.set(session.country, session.countryName)
      }
    }

    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [tab, activeSessions, scanSessions])

  const availableClasses = useMemo(() => {
    const seen = new Set<string>()
    for (const session of activeSessions) seen.add(classify(session).label)
    return [...seen].sort()
  }, [activeSessions])

  const filteredSessions = useMemo(
    () =>
      activeSessions.filter((session) => {
        if (filters.search && !session.srcIp.includes(filters.search)) return false
        if (filters.country && session.country !== filters.country) return false
        if (filters.classification && classify(session).label !== filters.classification) return false
        return true
      }),
    [activeSessions, filters],
  )

  const filteredGroups = useMemo(
    () =>
      scanGroups.filter((group) => {
        if (filters.search && !group.srcIp.includes(filters.search)) return false
        if (filters.country && group.country !== filters.country) return false
        return true
      }),
    [scanGroups, filters],
  )

  function setFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function setTab(nextTab: "sessions" | "scans") {
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", nextTab)
    next.set("page", "1")
    router.push(`${pathname}?${next.toString()}`)
  }

  const activeFilters = [filters.search, filters.country, filters.classification].filter(Boolean)

  if (!showAll) {
    const preview = activeSessions.slice(0, 5)

    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold text-foreground">Sesiones recientes</h3>
          <p className="text-sm text-muted-foreground">
            {activeSessions.length} sesiones comprometidas - {scanGroups.length} IPs escanearon
          </p>
        </div>
        <div className="divide-y divide-border">
          {preview.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Sin sesiones activas.</p>
          ) : (
            preview.map((session) => <SessionRow key={session.id} session={session} />)
          )}
        </div>
        {sessions.length > 5 && (
          <div className="border-t border-border p-4 text-center">
            <Link href="/sessions" className="text-sm text-accent hover:underline">
              Ver todas las {sessions.length} sesiones
            </Link>
          </div>
        )}
      </div>
    )
  }

  const compromisedCount = summary?.compromised ?? activeSessions.length
  const scanGroupCount = summary?.scanGroups ?? scanGroups.length

  return (
    <div className="flex min-h-[620px] max-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="space-y-4 border-b border-border p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Sessions</h3>
            <p className="text-xs text-muted-foreground">
              {compromisedCount.toLocaleString()} comprometidas - {scanGroupCount.toLocaleString()} IPs en escaneo
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            {(["sessions", "scans"] as const).map((currentTab) => (
              <button
                key={currentTab}
                onClick={() => setTab(currentTab)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === currentTab
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {currentTab === "sessions" ? <ShieldX className="h-3.5 w-3.5" /> : <ScanLine className="h-3.5 w-3.5" />}
                {currentTab === "sessions" ? "Sesiones" : "Escaneos"}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    tab === currentTab
                      ? currentTab === "sessions"
                        ? "bg-destructive/20 text-destructive"
                        : "bg-secondary text-foreground"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {currentTab === "sessions" ? compromisedCount : scanGroupCount}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form className="flex min-w-[320px] flex-1 items-center gap-2" action={pathname}>
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="pageSize" value={String(pagination?.pageSize ?? 50)} />
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                name="q"
                placeholder="Buscar IP, usuario, cliente..."
                value={serverQuery}
                onChange={(event) => setServerQuery(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Buscar
            </button>
            {searchQuery && (
              <Link
                href={`${pathname}?tab=${tab}&pageSize=${pagination?.pageSize ?? 50}`}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Limpiar
              </Link>
            )}
          </form>

          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={tab === "sessions" ? "Filtrar IPs visibles..." : "Filtrar IPs agrupadas..."}
              value={filters.search}
              onChange={(event) => setFilter("search", event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <select
            value={filters.country}
            onChange={(event) => setFilter("country", event.target.value)}
            className="h-10 min-w-[220px] rounded-lg border border-border bg-secondary px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todos los paises</option>
            {availableCountries.map(([code, name]) => (
              <option key={code} value={code}>
                {countryFlag(code)} {name}
              </option>
            ))}
          </select>

          {tab === "sessions" && (
            <select
              value={filters.classification}
              onChange={(event) => setFilter("classification", event.target.value)}
              className="h-10 min-w-[220px] rounded-lg border border-border bg-secondary px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todos los tipos</option>
              {availableClasses.map((classification) => (
                <option key={classification} value={classification}>
                  {classification}
                </option>
              ))}
            </select>
          )}

          <span className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            {tab === "sessions"
              ? `${filteredSessions.length} visibles de ${activeSessions.length}`
              : `${filteredGroups.length} visibles de ${scanGroups.length}`}
          </span>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {filters.search && (
              <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                IP: {filters.search}
                <button type="button" onClick={() => setFilter("search", "")}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filters.country && (
              <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                {countryFlag(filters.country)} {filters.country}
                <button type="button" onClick={() => setFilter("country", "")}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filters.classification && (
              <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                {filters.classification}
                <button type="button" onClick={() => setFilter("classification", "")}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="divide-y divide-border">
          {tab === "sessions" ? (
            filteredSessions.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No hay sesiones que coincidan con los filtros.</p>
            ) : (
              filteredSessions.map((session) => <SessionRow key={session.id} session={session} />)
            )
          ) : filteredGroups.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No hay escaneos que coincidan con los filtros.</p>
          ) : (
            filteredGroups.map((group) => <ScanGroupRow key={group.srcIp} group={group} />)
          )}
        </div>
      </div>

      {pagination && <TablePagination pagination={pagination} />}
    </div>
  )
}
