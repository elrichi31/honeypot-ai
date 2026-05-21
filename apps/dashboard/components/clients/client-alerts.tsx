"use client"

import { useEffect, useState, useCallback } from "react"
import { ShieldAlert, ShieldCheck, Skull, AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IpEnrichmentPopover } from "@/components/ip-enrichment-popover"

type ThreatEntry = {
  srcIp: string
  totalEvents: number
  sources: string[]
  protocols: string[]
  lastSeen: string
  loginSuccesses: number
}

type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

function riskLevel(e: ThreatEntry): "critical" | "high" | "medium" | "low" {
  if (e.loginSuccesses > 0)  return "critical"
  if (e.totalEvents >= 100)  return "high"
  if (e.totalEvents >= 20)   return "medium"
  return "low"
}

const RISK: Record<string, { label: string; dot: string; text: string; Icon: React.ElementType }> = {
  critical: { label: "CRIT",   dot: "bg-red-500",    text: "text-red-400",    Icon: Skull        },
  high:     { label: "HIGH",   dot: "bg-orange-500", text: "text-orange-400", Icon: ShieldAlert  },
  medium:   { label: "MED",    dot: "bg-yellow-500", text: "text-yellow-400", Icon: AlertTriangle },
  low:      { label: "LOW",    dot: "bg-blue-500",   text: "text-blue-400",   Icon: ShieldCheck  },
}

const SOURCE_PILL: Record<string, string> = {
  ssh:      "bg-cyan-400/15 text-cyan-400",
  protocol: "bg-blue-400/15 text-blue-400",
  web:      "bg-green-400/15 text-green-400",
}

function formatTs(ts: string) {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "2-digit" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}

type Props = { clientSlug: string }

export function ClientAlerts({ clientSlug }: Props) {
  const [items, setItems]   = useState<ThreatEntry[]>([])
  const [meta, setMeta]     = useState<PaginationMeta | null>(null)
  const [page, setPage]     = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback((p: number) => {
    setLoading(true)
    fetch(`/api/clients/${clientSlug}/threats?page=${p}&pageSize=20`)
      .then(r => r.json())
      .then((data: unknown) => {
        const d = data && typeof data === "object" ? data as Record<string, unknown> : {}
        setItems(Array.isArray(d.items) ? d.items : [])
        setMeta(d.pagination && typeof d.pagination === "object" ? d.pagination as PaginationMeta : null)
      })
      .catch(() => { setItems([]); setMeta(null) })
      .finally(() => setLoading(false))
  }, [clientSlug])

  useEffect(() => { load(1) }, [load])

  function goPage(p: number) {
    setPage(p)
    load(p)
  }

  const critCount = items.filter(e => riskLevel(e) === "critical").length
  const highCount = items.filter(e => riskLevel(e) === "high").length

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-400/10">
            <ShieldAlert className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Alerts</h2>
            <p className="text-[11px] text-muted-foreground">
              {loading
                ? "Loading…"
                : meta
                  ? `${meta.total.toLocaleString()} IPs${critCount > 0 ? ` · ${critCount} critical` : ""}${highCount > 0 ? ` · ${highCount} high` : ""}`
                  : "No data"}
            </p>
          </div>
        </div>
        <button
          onClick={() => load(page)}
          disabled={loading}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto font-mono text-xs bg-[#0d0d0f] min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-red-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14">
            <ShieldCheck className="h-7 w-7 text-emerald-400/40" />
            <p className="text-[11px] text-muted-foreground">No threats detected</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="pl-3 pr-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60 w-6">
                  {/* dot */}
                </th>
                <th className="pr-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60 w-[70px]">RISK</th>
                <th className="pr-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60">SOURCE IP</th>
                <th className="pr-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60">SOURCES</th>
                <th className="pr-3 py-1.5 text-right text-[10px] font-medium text-muted-foreground/60 w-[60px]">EVENTS</th>
                <th className="pr-3 py-1.5 text-right text-[10px] font-medium text-muted-foreground/60 w-[130px]">LAST SEEN</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry, i) => {
                const level = riskLevel(entry)
                const r     = RISK[level]
                return (
                  <tr
                    key={entry.srcIp}
                    className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${
                      i % 2 === 0 ? "" : "bg-white/[0.01]"
                    }`}
                  >
                    {/* Risk dot */}
                    <td className="pl-3 pr-2 py-1.5 align-middle">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${r.dot}`} />
                    </td>
                    {/* Risk label */}
                    <td className="pr-3 py-1.5 align-middle">
                      <span className={`text-[10px] font-bold ${r.text}`}>{r.label}</span>
                      {entry.loginSuccesses > 0 && (
                        <span className="ml-1 text-[9px] text-red-400/80">+{entry.loginSuccesses}✓</span>
                      )}
                    </td>
                    {/* IP */}
                    <td className="pr-3 py-1.5 align-middle">
                      <IpEnrichmentPopover ip={entry.srcIp} className="text-yellow-300/90" />
                    </td>
                    {/* Source pills */}
                    <td className="pr-3 py-1.5 align-middle">
                      <div className="flex gap-1 flex-wrap">
                        {entry.sources.map(src => (
                          <span
                            key={src}
                            className={`rounded px-1 py-0.5 text-[9px] font-medium ${SOURCE_PILL[src] ?? "bg-muted/40 text-muted-foreground"}`}
                          >
                            {src}
                          </span>
                        ))}
                      </div>
                    </td>
                    {/* Count */}
                    <td className="pr-3 py-1.5 align-middle text-right text-muted-foreground/80">
                      {entry.totalEvents.toLocaleString()}
                    </td>
                    {/* Last seen */}
                    <td className="pr-3 py-1.5 align-middle text-right text-muted-foreground/60 whitespace-nowrap">
                      {formatTs(entry.lastSeen)}
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
          <span className="font-mono text-[11px] text-muted-foreground">
            Page {meta.page} of {meta.totalPages} · {meta.total.toLocaleString()} IPs
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
  )
}
