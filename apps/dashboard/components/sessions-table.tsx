"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Filter, Search, ShieldX, ScanLine, X, Bot, User } from "lucide-react"
import type { PaginationMeta, SessionsSummary } from "@/lib/api"
import { TableShell } from "@/components/table-shell"
import { NavTransitionProvider, useNavTransitionOptional } from "@/lib/use-nav-transition"
import { cn } from "@/lib/utils"
import { countryFlag } from "@/lib/formatting"
import { classify, groupScans, type SessionItem } from "@/lib/session-classify-v2"
import { SessionRow } from "./session-row"
import { ScanGroupRow } from "./scan-group-row"

export type { SessionItem }

interface SessionsTableProps {
  sessions: SessionItem[]
  showAll?: boolean
  tab?: "sessions" | "scans"
  searchQuery?: string
  actor?: "all" | "bot" | "human" | "unknown"
  summary?: SessionsSummary
  pagination?: PaginationMeta
}

interface Filters {
  search: string
  country: string
  classification: string
}

export function SessionsTable(props: SessionsTableProps) {
  // The preview variant (showAll=false) has no tabs/filters/pagination, so it
  // doesn't need the navigation transition machinery.
  if (!props.showAll) {
    return <SessionsTableInner {...props} />
  }
  return (
    <NavTransitionProvider>
      <SessionsTableInner {...props} />
    </NavTransitionProvider>
  )
}

function SessionsTableInner({
  sessions,
  showAll = false,
  tab = "sessions",
  searchQuery = "",
  actor = "all",
  summary,
  pagination,
}: SessionsTableProps) {
  const pathname = usePathname()
  const { pushParams } = useNavTransitionOptional()
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
    pushParams({ tab: nextTab, page: "1" })
  }

  function setActorFilter(nextActor: "all" | "bot" | "human") {
    if (nextActor === "all") {
      pushParams({ page: "1" }, ["actor"])
      return
    }
    pushParams({ actor: nextActor, page: "1" })
  }

  const activeFilters = [filters.search, filters.country, filters.classification].filter(Boolean)

  if (!showAll) {
    const preview = activeSessions.slice(0, 5)

    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold text-foreground">Recent sessions</h3>
          <p className="text-sm text-muted-foreground">
            {activeSessions.length} compromised sessions · {scanGroups.length} IPs scanned
          </p>
        </div>
        <div className="divide-y divide-border">
          {preview.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No active sessions.</p>
          ) : (
            preview.map((session) => <SessionRow key={session.id} session={session} />)
          )}
        </div>
        {sessions.length > 5 && (
          <div className="border-t border-border p-4 text-center">
            <Link href="/sessions" className="text-sm text-accent hover:underline">
              View all {sessions.length} sessions
            </Link>
          </div>
        )}
      </div>
    )
  }

  const compromisedCount = summary?.compromised ?? activeSessions.length
  const scanGroupCount = summary?.scanGroups ?? scanGroups.length
  const botCount = summary?.bots ?? 0
  const humanCount = summary?.humans ?? 0

  const titleEnd = (
    <>
            {tab === "sessions" && (
              <div className="flex gap-1 rounded-lg bg-secondary p-1">
                {(
                  [
                    { value: "all" as const, label: "All", icon: null, count: null, activeColor: "" },
                    { value: "bot" as const, label: "Bots", icon: Bot, count: botCount, activeColor: "bg-orange-500/20 text-orange-400" },
                    { value: "human" as const, label: "Humans", icon: User, count: humanCount, activeColor: "bg-blue-500/20 text-blue-400" },
                  ]
                ).map(({ value, label, icon: Icon, count, activeColor }) => {
                  const isActive = actor === value || (value === "all" && (actor === "all" || actor === "unknown"))
                  return (
                    <button
                      key={value}
                      onClick={() => setActorFilter(value)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        isActive
                          ? value === "all" ? "bg-card text-foreground shadow-sm" : activeColor
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {Icon && <Icon className="h-3 w-3" />}
                      {label}
                      {count !== null && count > 0 && (
                        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
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
                  {currentTab === "sessions" ? "Sessions" : "Scans"}
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
    </>
  )

  const toolbar = (
    <>
        <div className="flex flex-wrap items-center gap-3">
          <form className="flex min-w-[320px] flex-1 items-center gap-2" action={pathname}>
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="pageSize" value={String(pagination?.pageSize ?? 20)} />
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                name="q"
                placeholder="Search IP, username, client..."
                value={serverQuery}
                onChange={(event) => setServerQuery(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Search
            </button>
            {searchQuery && (
              <Link
                href={`${pathname}?tab=${tab}&pageSize=${pagination?.pageSize ?? 20}`}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Clear
              </Link>
            )}
          </form>

          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={tab === "sessions" ? "Filter visible IPs..." : "Filter grouped IPs..."}
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
            <option value="">All countries</option>
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
              <option value="">All types</option>
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
              ? `${filteredSessions.length} of ${activeSessions.length} visible`
              : `${filteredGroups.length} of ${scanGroups.length} visible`}
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
    </>
  )

  return (
    <TableShell
      title="Sessions"
      description={`${compromisedCount.toLocaleString('en-US')} compromised · ${scanGroupCount.toLocaleString('en-US')} IPs scanning`}
      titleEnd={titleEnd}
      toolbar={toolbar}
      pagination={pagination}
    >
      <div className="divide-y divide-border">
        {tab === "sessions" ? (
          filteredSessions.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No sessions matching filters.</p>
          ) : (
            filteredSessions.map((session) => <SessionRow key={session.id} session={session} />)
          )
        ) : filteredGroups.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No scans matching filters.</p>
        ) : (
          filteredGroups.map((group) => <ScanGroupRow key={group.srcIp} group={group} />)
        )}
      </div>
    </TableShell>
  )
}
