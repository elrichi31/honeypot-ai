"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { ScrollText, ChevronLeft, ChevronRight, RefreshCw, ChevronDown, ChevronRight as CollapseIcon, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IpEnrichmentPopover } from "@/components/ip-enrichment-popover"
import { ClientSessionModal } from "@/components/clients/client-session-modal"
import { formatTs } from "@/lib/formatting"
import { JsonTree } from "@/components/clients/json-tree"

type LogSource = "all" | "ssh" | "protocol" | "web"

type LogEntry = {
  id: string
  source: string
  protocol: string
  srcIp: string
  eventType: string
  timestamp: string
  message: string | null
  command: string | null
  username: string | null
  password: string | null
  sessionId: string | null
  extra: Record<string, unknown> | null
}

type PaginationMeta = {
  page: number; pageSize: number; total: number
  totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean
}

const SOURCE_TABS: { key: LogSource; label: string }[] = [
  { key: "all", label: "All" }, { key: "ssh", label: "SSH" },
  { key: "protocol", label: "Protocol" }, { key: "web", label: "Web" },
]

const SOURCE_COLOR: Record<string, string> = {
  ssh: "text-cyan-400", protocol: "text-blue-400", web: "text-green-400",
}

function buildPairs(entry: LogEntry): [string, string][] {
  const pairs: [string, string][] = []
  pairs.push(["proto",  entry.protocol.toUpperCase()])
  pairs.push(["event",  entry.eventType])
  if (entry.username) pairs.push(["user", entry.username])
  if (entry.password) pairs.push(["pass", entry.password])
  if (entry.command)  pairs.push(["cmd",  entry.command])
  if (entry.message)  pairs.push(["msg",  entry.message])
  return pairs
}

const VALUE_COLOR: Record<string, string> = {
  event:  "text-purple-300/90",
  user:   "text-orange-300/90",
  pass:   "text-red-300/90",
  cmd:    "text-green-300/90",
  msg:    "text-blue-200/90",
}

// Detect if string looks like an IP address (v4 or v6)
const IP_RE = /^[\d.]{7,15}$|^[0-9a-fA-F:]+:[0-9a-fA-F:]+$/

type Props = { clientSlug: string }

export function ClientLogsViewer({ clientSlug }: Props) {
  const [source, setSource]         = useState<LogSource>("all")
  const [page, setPage]             = useState(1)
  const [items, setItems]           = useState<LogEntry[]>([])
  const [meta, setMeta]             = useState<PaginationMeta | null>(null)
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [search, setSearch]         = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [sessionId, setSessionId]   = useState<string | null>(null)
  const debounceTimer               = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search input — 300ms
  function handleSearchChange(value: string) {
    setSearch(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value.trim())
      setPage(1)
    }, 300)
  }

  function clearSearch() {
    setSearch("")
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    setDebouncedSearch("")
    setPage(1)
  }

  const load = useCallback((p: number, src: LogSource, q: string) => {
    setLoading(true)
    setExpanded(new Set())

    // Route search: IP-like → ip param (indexed equality), text → q param (ILIKE)
    const searchParam = q
      ? IP_RE.test(q) ? `&ip=${encodeURIComponent(q)}` : `&q=${encodeURIComponent(q)}`
      : ""

    fetch(`/api/clients/${clientSlug}/events?page=${p}&pageSize=25&source=${src}${searchParam}`)
      .then(r => r.json())
      .then((data: unknown) => {
        const d = data && typeof data === "object" ? data as Record<string, unknown> : {}
        setItems(Array.isArray(d.items) ? d.items : [])
        setMeta(d.pagination && typeof d.pagination === "object" ? d.pagination as PaginationMeta : null)
      })
      .catch(() => { setItems([]); setMeta(null) })
      .finally(() => setLoading(false))
  }, [clientSlug])

  useEffect(() => { setPage(1); load(1, source, debouncedSearch) }, [source, debouncedSearch, load])

  function goPage(p: number) { setPage(p); load(p, source, debouncedSearch) }

  function toggleRow(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10">
              <ScrollText className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Logs</h2>
              <p className="text-[11px] text-muted-foreground">
                {meta ? `${meta.total.toLocaleString()} events` : "Loading…"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
              {SOURCE_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setSource(tab.key)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    source === tab.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => load(page, source, debouncedSearch)}
              disabled={loading}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-3 py-2 border-b border-border/40 bg-[#0d0d0f]">
          <div className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5">
            <Search className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Filter by IP, username, command…"
              className="flex-1 bg-transparent font-mono text-xs text-foreground placeholder:text-muted-foreground/40 outline-none"
            />
            {search && (
              <button onClick={clearSearch} className="text-muted-foreground/50 hover:text-muted-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Log lines */}
        <div className="overflow-auto font-mono text-xs bg-[#0d0d0f] min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-14">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-cyan-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center py-14 text-muted-foreground text-[11px]">
              No events found
            </div>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {items.map((entry, i) => {
                  const pairs    = buildPairs(entry)
                  const srcColor = SOURCE_COLOR[entry.source] ?? "text-muted-foreground"
                  const isOpen   = expanded.has(entry.id)
                  const hasExtra = !!entry.extra && Object.keys(entry.extra).length > 0
                  const hasSession = !!entry.sessionId && entry.source === "ssh"

                  return (
                    <>
                      {/* Main row */}
                      <tr
                        key={entry.id}
                        onClick={() => {
                          if (hasSession) { setSessionId(entry.sessionId!); return }
                          if (hasExtra) toggleRow(entry.id)
                        }}
                        className={`border-b border-white/[0.04] transition-colors
                          ${i % 2 === 0 ? "" : "bg-white/[0.01]"}
                          ${(hasExtra || hasSession) ? "cursor-pointer hover:bg-white/[0.04]" : ""}
                          ${isOpen ? "bg-white/[0.03]" : ""}
                        `}
                      >
                        {/* Expand / drill-down toggle */}
                        <td className="pl-2 pr-1 py-1.5 align-top w-4 select-none">
                          {hasSession ? (
                            <CollapseIcon className="h-3 w-3 text-cyan-400/50" />
                          ) : hasExtra ? (
                            isOpen
                              ? <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                              : <CollapseIcon className="h-3 w-3 text-muted-foreground/30" />
                          ) : null}
                        </td>
                        {/* Timestamp */}
                        <td className="pr-3 py-1.5 text-muted-foreground/50 align-top w-[148px] whitespace-nowrap select-none">
                          {formatTs(entry.timestamp)}
                        </td>
                        {/* Content */}
                        <td className="pr-3 py-1.5 align-top">
                          <span className={`mr-2 font-semibold ${srcColor}`}>
                            [{entry.source.toUpperCase()}]
                          </span>
                          <span className="mr-3 inline-flex gap-1">
                            <span className="text-muted-foreground/60">#src_ip=</span>
                            <IpEnrichmentPopover ip={entry.srcIp} className="text-yellow-300/90" />
                          </span>
                          {pairs.map(([k, v], idx) => (
                            <span key={idx} className="mr-3 inline-flex gap-1">
                              <span className="text-muted-foreground/60">#{k}=</span>
                              <span className={VALUE_COLOR[k] ?? "text-foreground/80"}>
                                {v.length > 80 ? v.slice(0, 80) + "…" : v}
                              </span>
                            </span>
                          ))}
                        </td>
                      </tr>

                      {/* Expanded JSON row (non-SSH with extra) */}
                      {isOpen && entry.extra && (
                        <tr key={`${entry.id}-exp`} className="border-b border-white/[0.06] bg-white/[0.025]">
                          <td />
                          <td className="py-2 align-top text-[11px] text-muted-foreground/50 whitespace-nowrap pr-3">
                            full event
                          </td>
                          <td className="pr-4 py-2.5 align-top">
                            <div className="rounded-lg bg-black/40 border border-white/[0.06] px-3 py-2.5 text-[11px]">
                              <JsonTree data={entry.extra} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/60 bg-card rounded-b-xl">
            <span className="font-mono text-[11px] text-muted-foreground">
              Page {meta.page} of {meta.totalPages} · {meta.total.toLocaleString()} total
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => goPage(page - 1)} disabled={!meta.hasPreviousPage || loading} className="h-6 w-6 p-0">
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => goPage(page + 1)} disabled={!meta.hasNextPage || loading} className="h-6 w-6 p-0">
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <ClientSessionModal sessionId={sessionId} onClose={() => setSessionId(null)} />
    </>
  )
}
