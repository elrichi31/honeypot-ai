"use client"

import { useEffect, useState, useCallback } from "react"
import { AlertTriangle, RefreshCw, Search, EyeOff, Eye } from "lucide-react"
import { Surface } from "@/components/ui/surface"
import { StatCard } from "@/components/ui/stat-card"
import { TableCardFooter } from "@/components/ui/table-card"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import dynamic from "next/dynamic"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import { useT } from "@/components/locale-provider"
import type { TranslationKey } from "@/lib/i18n/dictionaries"
import type { Stats, Alert, Pagination, Range } from "./types"

const TimelineChart = dynamic(() => import("./timeline-chart"), { ssr: false })

const SEVERITY_CONFIG = {
  1: { labelKey: "suricata.stat.critical", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  2: { labelKey: "suricata.stat.high",     className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  3: { labelKey: "suricata.stat.medium",   className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  4: { labelKey: "suricata.stat.low",      className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
} as const satisfies Record<number, { labelKey: TranslationKey; className: string }>
type SeverityKey = keyof typeof SEVERITY_CONFIG

function SeverityBadge({ severity }: { severity: number }) {
  const t = useT()
  const cfg = SEVERITY_CONFIG[severity as SeverityKey] ?? SEVERITY_CONFIG[4]
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {t(cfg.labelKey)}
    </span>
  )
}

function ToggleButton({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void
  icon: React.ElementType; label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  )
}

const RANGE_LABEL_KEYS: Record<Range, TranslationKey | null> = { "24h": null, "7d": "suricata.range.7d", "30d": "suricata.range.30d" }

export function SuricataClient({ initialStats }: { initialStats: Stats | null }) {
  const t = useT()
  const tz = useTimezone()
  const rangeLabel = (r: Range) => { const k = RANGE_LABEL_KEYS[r]; return k ? t(k) : r }
  const [stats, setStats]           = useState<Stats | null>(initialStats)
  const [alerts, setAlerts]         = useState<Alert[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [severity, setSeverity]     = useState("")
  const [q, setQ]                   = useState("")
  const [qInput, setQInput]         = useState("")
  const [hideNoise, setHideNoise]   = useState(true)
  const [excludeOwn, setExcludeOwn] = useState(true)
  const [tab, setTab]               = useState<"threats" | "all">("threats")
  const [range, setRange]           = useState<Range>("24h")

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/suricata/stats?range=${range}`)
      if (res.ok) setStats(await res.json())
    } catch {}
  }, [range])

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" })
      if (severity) params.set("severity", severity)
      if (q) params.set("q", q)
      params.set("hideNoise", String(hideNoise))
      params.set("excludeOwnIps", String(excludeOwn))
      const res = await fetch(`/api/suricata/alerts?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.items ?? [])
        setPagination(data.pagination ?? null)
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [page, severity, q, hideNoise, excludeOwn])

  useEffect(() => { fetchStats(); setPage(1) }, [fetchStats])
  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault(); setPage(1); setQ(qInput.trim())
  }

  const displayed = stats
    ? (tab === "threats" ? stats.threats24h : stats.last24h)
    : null

  const topSigs = stats
    ? (tab === "threats" ? stats.topThreatSignatures : stats.topSignatures)
    : []

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Range selector */}
          <div className="flex gap-1 rounded-lg border border-border bg-muted/20 p-1">
            {(["24h", "7d", "30d"] as Range[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {r}
              </button>
            ))}
          </div>
          <ToggleButton active={hideNoise} onClick={() => { setHideNoise(v => !v); setPage(1) }} icon={hideNoise ? EyeOff : Eye} label={t("suricata.hideNoise")} />
          <ToggleButton active={excludeOwn} onClick={() => { setExcludeOwn(v => !v); setPage(1) }} icon={excludeOwn ? EyeOff : Eye} label={t("suricata.excludeOwn")} />
        </div>
      </div>

      {/* Tab: threats vs all */}
      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-muted/20 p-1 w-fit">
        {(["threats", "all"] as const).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              tab === tabKey ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tabKey === "threats" ? t("suricata.tab.threats") : t("suricata.tab.all")}
          </button>
        ))}
      </div>

      {/* Stats cards */}
      {displayed ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label={t("suricata.stat.total")}    value={displayed.total.toLocaleString()}    sub={t("suricata.stat.last", { range: rangeLabel(range) })} />
          <StatCard label={t("suricata.stat.critical")} tone="critical" value={displayed.critical.toLocaleString()} />
          <StatCard label={t("suricata.stat.high")}     tone="high"     value={displayed.high.toLocaleString()} />
          <StatCard label={t("suricata.stat.medium")}   value={<span className="text-yellow-400">{displayed.medium.toLocaleString()}</span>} />
          <StatCard label={t("suricata.stat.low")}      value={<span className="text-blue-400">{displayed.low.toLocaleString()}</span>} />
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Surface key={i} className="h-20 animate-pulse" />
          ))}
        </div>
      )}

      {/* Timeline */}
      {stats?.timeline && (
        <Surface padded className="mb-6">
          <p className="mb-3 text-sm font-medium text-foreground">
            {t("suricata.timeline")}
            <span className="ml-2 text-xs text-muted-foreground">— {rangeLabel(range)}</span>
          </p>
          <TimelineChart data={stats.timeline} range={range} />
        </Surface>
      )}

      {/* Top sigs + top sources */}
      {stats && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Surface padded>
            <p className="mb-3 text-sm font-medium text-foreground">
              {t("suricata.topSignatures")} {tab === "threats" && <span className="text-xs text-muted-foreground ml-1">— {t("suricata.threatsOnly")}</span>}
            </p>
            <div className="space-y-2">
              {topSigs.slice(0, 7).map((sig, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <SeverityBadge severity={sig.severity} />
                  <span className="flex-1 truncate text-muted-foreground text-xs" title={sig.signature}>{sig.signature}</span>
                  <span className="tabular-nums text-foreground font-medium text-xs">{sig.count.toLocaleString()}</span>
                </div>
              ))}
              {topSigs.length === 0 && <p className="text-xs text-muted-foreground">{t("suricata.noAlerts24h")}</p>}
            </div>
          </Surface>

          <Surface padded>
            <p className="mb-3 text-sm font-medium text-foreground">{t("suricata.topAttackers")}</p>
            <div className="space-y-2">
              {stats.topSources.slice(0, 7).map((src, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {src.country && (
                    <span className="text-xs text-muted-foreground/60 w-6 shrink-0 uppercase">{src.country}</span>
                  )}
                  <span className="flex-1 font-mono text-foreground text-xs">{src.srcIp}</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-1.5 rounded-full bg-orange-500/60"
                      style={{ width: `${Math.max(8, (src.count / (stats.topSources[0]?.count ?? 1)) * 80)}px` }}
                    />
                    <span className="tabular-nums text-muted-foreground text-xs w-16 text-right">{src.count.toLocaleString()}</span>
                  </div>
                </div>
              ))}
              {stats.topSources.length === 0 && <p className="text-xs text-muted-foreground">{t("suricata.noExternalAlerts24h")}</p>}
            </div>
          </Surface>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={t("suricata.searchPlaceholder")}
              className="h-8 rounded-lg border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button type="submit" className="h-8 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:text-foreground">
            {t("suricata.search")}
          </button>
        </form>

        <select
          value={severity}
          onChange={(e) => { setSeverity(e.target.value); setPage(1) }}
          className="h-8 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground"
        >
          <option value="">{t("suricata.allSeverities")}</option>
          <option value="1">{t("suricata.stat.critical")}</option>
          <option value="2">{t("suricata.stat.high")}</option>
          <option value="3">{t("suricata.stat.medium")}</option>
          <option value="4">{t("suricata.stat.low")}</option>
        </select>

        <button
          onClick={() => { fetchStats(); fetchAlerts() }}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("suricata.refresh")}
        </button>
      </div>

      {/* Alerts table */}
      <Surface className="overflow-hidden">
        {loading ? (
          <div className="space-y-px">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 animate-pulse bg-muted/20" />)}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertTriangle className="mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm">{t("suricata.noAlertsFound")}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("suricata.col.severity")}</TableHead>
                <TableHead>{t("suricata.col.time")}</TableHead>
                <TableHead>{t("suricata.col.source")}</TableHead>
                <TableHead>{t("suricata.col.destination")}</TableHead>
                <TableHead>{t("suricata.col.proto")}</TableHead>
                <TableHead>{t("suricata.col.signature")}</TableHead>
                <TableHead>{t("suricata.col.category")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell><SeverityBadge severity={alert.severity} /></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {formatInTimezone(alert.timestamp, tz, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-1.5">
                      {alert.country && (
                        <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground uppercase">{alert.country}</span>
                      )}
                      {alert.src_ip}{alert.src_port ? `:${alert.src_port}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {alert.dest_ip}{alert.dest_port ? `:${alert.dest_port}` : ""}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground uppercase">{alert.proto}</TableCell>
                  <TableCell className="max-w-xs">
                    <span className="block truncate text-xs" title={alert.signature}>{alert.signature}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="block truncate max-w-[180px]" title={alert.category}>{alert.category}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {pagination && pagination.totalPages > 1 && (
          <TableCardFooter className="text-sm">
            <span>
              {t("suricata.pageRange", {
                from: ((pagination.page - 1) * pagination.pageSize + 1).toLocaleString(),
                to: Math.min(pagination.page * pagination.pageSize, pagination.total).toLocaleString(),
                total: pagination.total.toLocaleString(),
              })}
            </span>
            <div className="flex gap-2">
              <button disabled={!pagination.hasPreviousPage} onClick={() => setPage(p => p - 1)}
                className="rounded-lg border border-border px-3 py-1 text-xs disabled:opacity-40 hover:bg-muted/20">{t("suricata.previous")}</button>
              <button disabled={!pagination.hasNextPage} onClick={() => setPage(p => p + 1)}
                className="rounded-lg border border-border px-3 py-1 text-xs disabled:opacity-40 hover:bg-muted/20">{t("suricata.next")}</button>
            </div>
          </TableCardFooter>
        )}
      </Surface>
    </>
  )
}
