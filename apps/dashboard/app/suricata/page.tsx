"use client"

import { useEffect, useState, useCallback } from "react"
import { Shield, AlertTriangle, RefreshCw, Search, EyeOff, Eye } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"

const SEVERITY_CONFIG = {
  1: { label: "Critical", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  2: { label: "High",     className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  3: { label: "Medium",   className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  4: { label: "Low",      className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
} as const
type SeverityKey = keyof typeof SEVERITY_CONFIG

interface Alert {
  id: string; sensor_id: string; timestamp: string
  src_ip: string; src_port: number | null; dest_ip: string; dest_port: number | null
  proto: string; action: string; signature_id: number; signature: string
  category: string; severity: number; in_iface: string | null; country: string | null
}

type Range = "24h" | "7d" | "30d"

interface Stats {
  last24h: { total: number; critical: number; high: number; medium: number; low: number }
  threats24h: { total: number; critical: number; high: number; medium: number; low: number }
  topSignatures: Array<{ signature: string; severity: number; severityLabel: string; count: number }>
  topThreatSignatures: Array<{ signature: string; severity: number; severityLabel: string; category: string; count: number }>
  topSources: Array<{ srcIp: string; count: number; country: string | null }>
  timeline: Array<{ bucket: string; total: number; threats: number }>
}

interface Pagination {
  page: number; pageSize: number; total: number; totalPages: number
  hasNextPage: boolean; hasPreviousPage: boolean
}

function SeverityBadge({ severity }: { severity: number }) {
  const cfg = SEVERITY_CONFIG[severity as SeverityKey] ?? SEVERITY_CONFIG[4]
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function StatCard({ label, value, sub, className }: { label: string; value: number; sub?: string; className?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${className ?? "text-foreground"}`}>
        {value.toLocaleString()}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground/60">{sub}</p>}
    </div>
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

const RANGE_LABELS: Record<Range, string> = { "24h": "24h", "7d": "7 days", "30d": "30 days" }

function TimelineChart({ data, range }: { data: Stats["timeline"]; range: Range }) {
  const tz = useTimezone()
  if (!data.length) return null
  const dateOpts: Intl.DateTimeFormatOptions = range === "24h"
    ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
    : { month: "2-digit", day: "2-digit" }
  const chartData = data.map(d => ({
    label: formatInTimezone(d.bucket, tz, dateOpts),
    threats: d.threats,
    noise: d.total - d.threats,
  }))
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={chartData} barSize={range === "30d" ? 6 : 4} barGap={1}>
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6b7280" }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} width={32} />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: "#94a3b8" }}
        />
        <Bar dataKey="threats" stackId="a" fill="#f97316" name="Threats" radius={[0,0,0,0]} />
        <Bar dataKey="noise"   stackId="a" fill="#334155" name="Noise"   radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function SuricataPage() {
  const tz = useTimezone()
  const [stats, setStats]           = useState<Stats | null>(null)
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
    <PageShell>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Shield className="h-5 w-5 text-blue-400" />
            <h1 className="text-2xl font-semibold text-foreground">Network IDS</h1>
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">Suricata</span>
          </div>
          <p className="text-sm text-muted-foreground">ET Open rules · real-time intrusion detection</p>
        </div>
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
          <ToggleButton active={hideNoise} onClick={() => { setHideNoise(v => !v); setPage(1) }} icon={hideNoise ? EyeOff : Eye} label="Hide noise" />
          <ToggleButton active={excludeOwn} onClick={() => { setExcludeOwn(v => !v); setPage(1) }} icon={excludeOwn ? EyeOff : Eye} label="Exclude own IPs" />
        </div>
      </div>

      {/* Tab: threats vs all */}
      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-muted/20 p-1 w-fit">
        {(["threats", "all"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "threats" ? "Real Threats" : "All (incl. noise)"}
          </button>
        ))}
      </div>

      {/* Stats cards */}
      {displayed ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Total"    value={displayed.total}    sub={`last ${RANGE_LABELS[range]}`} />
          <StatCard label="Critical" value={displayed.critical} className="text-red-400" />
          <StatCard label="High"     value={displayed.high}     className="text-orange-400" />
          <StatCard label="Medium"   value={displayed.medium}   className="text-yellow-400" />
          <StatCard label="Low"      value={displayed.low}      className="text-blue-400" />
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {/* Timeline */}
      {stats?.timeline && (
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-sm font-medium text-foreground">
            Alert Timeline
            <span className="ml-2 text-xs text-muted-foreground">— {RANGE_LABELS[range]}</span>
          </p>
          <TimelineChart data={stats.timeline} range={range} />
        </div>
      )}

      {/* Top sigs + top sources */}
      {stats && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium text-foreground">
              Top Signatures (24h) {tab === "threats" && <span className="text-xs text-muted-foreground ml-1">— threats only</span>}
            </p>
            <div className="space-y-2">
              {topSigs.slice(0, 7).map((sig, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <SeverityBadge severity={sig.severity} />
                  <span className="flex-1 truncate text-muted-foreground text-xs" title={sig.signature}>{sig.signature}</span>
                  <span className="tabular-nums text-foreground font-medium text-xs">{sig.count.toLocaleString()}</span>
                </div>
              ))}
              {topSigs.length === 0 && <p className="text-xs text-muted-foreground">No alerts in last 24 hours</p>}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium text-foreground">Top Attackers (24h)</p>
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
              {stats.topSources.length === 0 && <p className="text-xs text-muted-foreground">No external alerts in last 24 hours</p>}
            </div>
          </div>
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
              placeholder="Signature, category, IP..."
              className="h-8 rounded-lg border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button type="submit" className="h-8 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:text-foreground">
            Search
          </button>
        </form>

        <select
          value={severity}
          onChange={(e) => { setSeverity(e.target.value); setPage(1) }}
          className="h-8 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground"
        >
          <option value="">All severities</option>
          <option value="1">Critical</option>
          <option value="2">High</option>
          <option value="3">Medium</option>
          <option value="4">Low</option>
        </select>

        <button
          onClick={() => { fetchStats(); fetchAlerts() }}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Alerts table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="space-y-px">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 animate-pulse bg-muted/20" />)}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertTriangle className="mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm">No alerts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Severity</th>
                  <th className="px-4 py-2.5 text-left font-medium">Time</th>
                  <th className="px-4 py-2.5 text-left font-medium">Source</th>
                  <th className="px-4 py-2.5 text-left font-medium">Destination</th>
                  <th className="px-4 py-2.5 text-left font-medium">Proto</th>
                  <th className="px-4 py-2.5 text-left font-medium">Signature</th>
                  <th className="px-4 py-2.5 text-left font-medium">Category</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5"><SeverityBadge severity={alert.severity} /></td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatInTimezone(alert.timestamp, tz, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        {alert.country && (
                          <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground uppercase">{alert.country}</span>
                        )}
                        {alert.src_ip}{alert.src_port ? `:${alert.src_port}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {alert.dest_ip}{alert.dest_port ? `:${alert.dest_port}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground uppercase">{alert.proto}</td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <span className="block truncate text-xs" title={alert.signature}>{alert.signature}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      <span className="block truncate max-w-[180px]" title={alert.category}>{alert.category}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <span>
              {((pagination.page - 1) * pagination.pageSize + 1).toLocaleString()}–
              {Math.min(pagination.page * pagination.pageSize, pagination.total).toLocaleString()} of {pagination.total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button disabled={!pagination.hasPreviousPage} onClick={() => setPage(p => p - 1)}
                className="rounded-lg border border-border px-3 py-1 text-xs disabled:opacity-40 hover:bg-muted/20">Previous</button>
              <button disabled={!pagination.hasNextPage} onClick={() => setPage(p => p + 1)}
                className="rounded-lg border border-border px-3 py-1 text-xs disabled:opacity-40 hover:bg-muted/20">Next</button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
