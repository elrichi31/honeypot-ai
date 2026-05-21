"use client"

import { useEffect, useState, useCallback } from "react"
import { ScrollText, ChevronLeft, ChevronRight, RefreshCw, Terminal, Globe, Network } from "lucide-react"
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

const SOURCE_STYLES: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  ssh:      { label: "SSH",      color: "text-cyan-400",   bg: "bg-cyan-400/10",   Icon: Terminal },
  protocol: { label: "Protocol", color: "text-blue-400",   bg: "bg-blue-400/10",   Icon: Network  },
  web:      { label: "Web",      color: "text-green-400",  bg: "bg-green-400/10",  Icon: Globe    },
}

const SOURCE_TABS: { key: LogSource; label: string }[] = [
  { key: "all",      label: "All"      },
  { key: "ssh",      label: "SSH"      },
  { key: "protocol", label: "Protocol" },
  { key: "web",      label: "Web"      },
]

function formatTs(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

function normalizeEventType(type: string) {
  return type
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
}

type Props = { clientSlug: string }

export function ClientLogsViewer({ clientSlug }: Props) {
  const [source, setSource]     = useState<LogSource>("all")
  const [page, setPage]         = useState(1)
  const [items, setItems]       = useState<LogEntry[]>([])
  const [meta, setMeta]         = useState<PaginationMeta | null>(null)
  const [loading, setLoading]   = useState(true)

  const load = useCallback((p: number, src: LogSource) => {
    setLoading(true)
    fetch(`/api/clients/${clientSlug}/events?page=${p}&pageSize=20&source=${src}`)
      .then(r => r.json())
      .then(data => {
        setItems(data.items ?? [])
        setMeta(data.pagination ?? null)
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
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10">
            <ScrollText className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Logs</h2>
            <p className="text-xs text-muted-foreground">
              {meta ? `${meta.total.toLocaleString()} events` : "Loading…"}
            </p>
          </div>
        </div>
        <button
          onClick={() => load(page, source)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Source tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
        {SOURCE_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setSource(tab.key)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              source === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Log entries */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-cyan-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          No logs found
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map(entry => {
            const style = SOURCE_STYLES[entry.source] ?? SOURCE_STYLES.ssh
            const Icon  = style.Icon
            const detail = entry.command || entry.message || null
            const hasCred = entry.username || entry.password

            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 hover:bg-background/70 transition-colors"
              >
                {/* Source icon */}
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${style.bg} mt-0.5`}>
                  <Icon className={`h-3.5 w-3.5 ${style.color}`} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Event type badge */}
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${style.bg} ${style.color}`}>
                      {normalizeEventType(entry.eventType)}
                    </span>
                    {/* Protocol */}
                    <span className="text-xs font-mono text-muted-foreground/80">
                      {entry.protocol.toUpperCase()}
                    </span>
                    {/* Source IP */}
                    <span className="text-xs font-mono text-foreground/90">{entry.srcIp}</span>
                    {/* Credentials */}
                    {hasCred && (
                      <span className="text-[10px] font-mono text-yellow-400/80">
                        {[entry.username, entry.password].filter(Boolean).join(" / ")}
                      </span>
                    )}
                  </div>
                  {/* Detail line */}
                  {detail && (
                    <p className="truncate font-mono text-xs text-muted-foreground">{detail}</p>
                  )}
                </div>

                {/* Timestamp */}
                <span className="shrink-0 text-[11px] text-muted-foreground/60 whitespace-nowrap">
                  {formatTs(entry.timestamp)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            Page {meta.page} of {meta.totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm" variant="outline"
              onClick={() => goPage(page - 1)}
              disabled={!meta.hasPreviousPage || loading}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => goPage(page + 1)}
              disabled={!meta.hasNextPage || loading}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
