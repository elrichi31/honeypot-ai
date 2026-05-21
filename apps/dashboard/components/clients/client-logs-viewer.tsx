"use client"

import { useEffect, useState, useCallback } from "react"
import { ScrollText, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

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
}

type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

const SOURCE_TABS: { key: LogSource; label: string }[] = [
  { key: "all",      label: "All"      },
  { key: "ssh",      label: "SSH"      },
  { key: "protocol", label: "Protocol" },
  { key: "web",      label: "Web"      },
]

const SOURCE_COLOR: Record<string, string> = {
  ssh:      "text-cyan-400",
  protocol: "text-blue-400",
  web:      "text-green-400",
}

// Build ordered key-value pairs to display CrowdStrike-style
function buildPairs(entry: LogEntry): [string, string][] {
  const pairs: [string, string][] = []
  pairs.push(["source",    entry.source])
  pairs.push(["proto",     entry.protocol.toUpperCase()])
  pairs.push(["src_ip",    entry.srcIp])
  pairs.push(["event",     entry.eventType])
  if (entry.username) pairs.push(["user",    entry.username])
  if (entry.password) pairs.push(["pass",    entry.password])
  if (entry.command)  pairs.push(["cmd",     entry.command])
  if (entry.message)  pairs.push(["msg",     entry.message])
  return pairs
}

function formatTs(ts: string) {
  const d = new Date(ts)
  const date = d.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "2-digit" })
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
  return `${date} ${time}`
}

type Props = { clientSlug: string }

export function ClientLogsViewer({ clientSlug }: Props) {
  const [source, setSource]   = useState<LogSource>("all")
  const [page, setPage]       = useState(1)
  const [items, setItems]     = useState<LogEntry[]>([])
  const [meta, setMeta]       = useState<PaginationMeta | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback((p: number, src: LogSource) => {
    setLoading(true)
    fetch(`/api/clients/${clientSlug}/events?page=${p}&pageSize=25&source=${src}`)
      .then(r => r.json())
      .then((data: unknown) => {
        const d = data && typeof data === "object" ? data as Record<string, unknown> : {}
        setItems(Array.isArray(d.items) ? d.items : [])
        setMeta(d.pagination && typeof d.pagination === "object" ? d.pagination as PaginationMeta : null)
      })
      .catch(() => { setItems([]); setMeta(null) })
      .finally(() => setLoading(false))
  }, [clientSlug])

  useEffect(() => {
    setPage(1)
    load(1, source)
  }, [source, load])

  function goPage(p: number) {
    setPage(p)
    load(p, source)
  }

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col" style={{ minHeight: 0 }}>
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
          {/* Source tabs */}
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
            onClick={() => load(page, source)}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Log lines */}
      <div className="flex-1 overflow-auto font-mono text-xs bg-[#0d0d0f] rounded-b-xl">
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
                const pairs = buildPairs(entry)
                const srcColor = SOURCE_COLOR[entry.source] ?? "text-muted-foreground"
                return (
                  <tr
                    key={entry.id}
                    className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${
                      i % 2 === 0 ? "" : "bg-white/[0.01]"
                    }`}
                  >
                    {/* Timestamp */}
                    <td className="whitespace-nowrap pl-3 pr-4 py-1.5 text-muted-foreground/60 align-top w-[148px] select-none">
                      {formatTs(entry.timestamp)}
                    </td>
                    {/* Key-value pairs */}
                    <td className="pr-3 py-1.5 align-top">
                      <span className={`mr-2 font-semibold ${srcColor}`}>
                        [{entry.source.toUpperCase()}]
                      </span>
                      {pairs.map(([k, v], idx) => (
                        <span key={idx} className="mr-3 inline-flex gap-1">
                          <span className="text-muted-foreground/70">#{k}=</span>
                          <span className={
                            k === "src_ip"   ? "text-yellow-300/90" :
                            k === "user"     ? "text-orange-300/90" :
                            k === "pass"     ? "text-red-300/90" :
                            k === "event"    ? "text-purple-300/90" :
                            k === "cmd"      ? "text-green-300/90" :
                            k === "msg"      ? "text-blue-200/90" :
                                               "text-foreground/80"
                          }>
                            {v.length > 80 ? v.slice(0, 80) + "…" : v}
                          </span>
                        </span>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/60 bg-card rounded-b-xl">
          <span className="text-[11px] text-muted-foreground">
            Page {meta.page} of {meta.totalPages} · {meta.total.toLocaleString()} total
          </span>
          <div className="flex gap-1">
            <Button
              size="sm" variant="outline"
              onClick={() => goPage(page - 1)}
              disabled={!meta.hasPreviousPage || loading}
              className="h-6 w-6 p-0"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => goPage(page + 1)}
              disabled={!meta.hasNextPage || loading}
              className="h-6 w-6 p-0"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
