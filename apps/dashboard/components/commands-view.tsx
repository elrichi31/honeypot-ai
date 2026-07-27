"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { TimeAgo } from "@/components/time-ago"
import { Search, Terminal, Clock, Globe, ShieldAlert, Eye, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { HoneypotEvent, PaginationMeta, CommandCategoriesResponse } from "@/lib/api"
import {
  CMD_COLORS,
  CMD_LABELS,
  CMD_SEVERITY_ORDER,
  CMD_MALICIOUS_CATEGORIES,
} from "@/lib/attack-types"
import { Surface } from "@/components/ui/surface"
import { TablePagination } from "./table-pagination"

interface CommandsViewProps {
  events: HoneypotEvent[]
  searchQuery: string
  pagination: PaginationMeta
  /** Threat-category counts across ALL matching command sessions, not just this page. */
  globalCategories?: CommandCategoriesResponse
  /** Active category filter from the URL (server-side filtered), or null. */
  activeCategory?: string | null
}

const OTHER = "other"

function categoryOf(event: HoneypotEvent): string {
  return event.commandCategory ?? OTHER
}

export function CommandsView({ events, searchQuery, pagination, globalCategories, activeCategory = null }: CommandsViewProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchQuery)

  useEffect(() => {
    setQuery(searchQuery)
  }, [searchQuery])

  // Toggle the server-side category filter via the URL (drops `page` so the
  // filtered results start at page 1).
  const toggleCategory = useCallback((category: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (params.get("category") === category) params.delete("category")
    else params.set("category", category)
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const commands = useMemo(
    () =>
      events
        .filter((event) => event.command)
        .sort((a, b) => new Date(b.eventTs).getTime() - new Date(a.eventTs).getTime()),
    [events],
  )

  // Category breakdown across ALL matching sessions (from the backend), ordered
  // by severity. Falls back to the current page if the global fetch is missing.
  const categoryCounts = useMemo(() => {
    const source: Record<string, number> = globalCategories?.categories ?? {}
    const entries = Object.keys(source).length > 0
      ? Object.entries(source)
      : (() => {
          const counts = new Map<string, number>()
          for (const event of commands) {
            const cat = categoryOf(event)
            counts.set(cat, (counts.get(cat) ?? 0) + 1)
          }
          return [...counts.entries()]
        })()
    return entries
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => {
        const ai = CMD_SEVERITY_ORDER.indexOf(a.category)
        const bi = CMD_SEVERITY_ORDER.indexOf(b.category)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })
  }, [globalCategories, commands])

  const totalCategorized = useMemo(
    () => categoryCounts.reduce((sum, c) => sum + c.count, 0),
    [categoryCounts],
  )

  const maliciousTotal = globalCategories?.malicious
    ?? commands.filter((c) => CMD_MALICIOUS_CATEGORIES.has(categoryOf(c))).length

  const visibleCommands = commands

  const topCommands = useMemo(() => {
    const counts = new Map<string, number>()
    for (const event of commands) {
      if (event.command) {
        const bin = event.command.trim().split(/\s+/)[0]
        counts.set(bin, (counts.get(bin) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [commands])

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Surface>
          <div className="border-b border-border p-4">
            <form action={pathname} className="flex flex-wrap gap-2">
              <input type="hidden" name="pageSize" value={String(pagination.pageSize)} />
              {activeCategory && <input type="hidden" name="category" value={activeCategory} />}
              <div className="relative min-w-72 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="q"
                  placeholder="Search command, IP or credential..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-10"
                />
              </div>
              <button
                type="submit"
                className="h-10 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Search
              </button>
            </form>

            {activeCategory && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Filtered by:</span>
                <button
                  type="button"
                  onClick={() => toggleCategory(activeCategory)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
                    CMD_COLORS[activeCategory] ?? CMD_COLORS.other,
                  )}
                >
                  {CMD_LABELS[activeCategory] ?? "Other"}
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <div className="max-h-[600px] divide-y divide-border overflow-y-auto">
            {visibleCommands.length > 0 ? (
              visibleCommands.map((command) => {
                const category = categoryOf(command)
                const malicious = CMD_MALICIOUS_CATEGORIES.has(category)
                return (
                  <div
                    key={command.id}
                    className={cn(
                      "p-4",
                      malicious && "border-l-2 border-l-red-500/60 bg-red-500/[0.03]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          malicious ? "bg-red-500/15" : "bg-warning/15",
                        )}
                      >
                        <Terminal
                          className={cn(
                            "h-4 w-4",
                            malicious ? "text-red-400" : "text-warning",
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex items-center gap-2">
                          {category !== OTHER && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
                                CMD_COLORS[category] ?? CMD_COLORS.other,
                              )}
                            >
                              {malicious ? (
                                <ShieldAlert className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                              {CMD_LABELS[category] ?? "Other"}
                            </span>
                          )}
                        </div>
                        <code className="block overflow-x-auto rounded bg-background px-3 py-2 font-mono text-sm text-foreground">
                          $ {command.command}
                        </code>
                        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {command.srcIp}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <TimeAgo timestamp={command.eventTs} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="p-8 text-center text-muted-foreground">No commands found</div>
            )}
          </div>

          <TablePagination pagination={pagination} />
        </Surface>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Surface padded>
            <h3 className="text-sm font-medium text-muted-foreground">Matching</h3>
            <p className="mt-1 text-3xl font-bold text-warning">
              {pagination.total.toLocaleString("en-US")}
            </p>
          </Surface>
          <Surface padded>
            <h3 className="text-sm font-medium text-muted-foreground">Malicious</h3>
            <p className="mt-1 text-3xl font-bold text-red-400">
              {maliciousTotal.toLocaleString("en-US")}
            </p>
          </Surface>
        </div>

        {categoryCounts.length > 0 && (
          <Surface>
            <div className="border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Threat Categories</h3>
              <p className="text-xs text-muted-foreground">Across all matching SSH sessions · click to filter</p>
            </div>
            <div className="divide-y divide-border">
              {categoryCounts.map(({ category, count }) => {
                const pct = totalCategorized > 0 ? Math.round((count / totalCategorized) * 100) : 0
                const malicious = CMD_MALICIOUS_CATEGORIES.has(category)
                const active = activeCategory === category
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={cn(
                      "w-full p-3 text-left transition-colors hover:bg-secondary/50",
                      active && "bg-secondary/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm text-foreground">
                        {malicious ? (
                          <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {CMD_LABELS[category] ?? "Other"}
                        {active && <X className="h-3 w-3 text-muted-foreground" />}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {count.toLocaleString("en-US")} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          malicious ? "bg-red-500/70" : "bg-muted-foreground/40",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </Surface>
        )}

        <Surface>
          <div className="border-b border-border p-4">
            <h3 className="font-semibold text-foreground">Most Used On This Page</h3>
          </div>
          <div className="divide-y divide-border">
            {topCommands.map((item, index) => (
              <div key={item.command} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                  <code className="font-mono text-sm text-foreground">{item.command}</code>
                </div>
                <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  )
}
