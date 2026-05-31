"use client"

import { useEffect, useState, useCallback } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts"

type Range = "24h" | "7d" | "30d"

type LiveStat = {
  container: string
  cpuPct: number
  memMb: number
}

type HistoryResponse = {
  containers: string[]
  points: Record<string, number | null | string>[]
}

const RANGE_OPTIONS: { label: string; value: Range }[] = [
  { label: "24h", value: "24h" },
  { label: "7d",  value: "7d"  },
  { label: "30d", value: "30d" },
]

// Distinct colors for up to 6 containers
const COLORS = ["#60a5fa", "#34d399", "#f59e0b", "#f87171", "#a78bfa", "#fb923c"]

function fmtLabel(ts: string, range: Range): string {
  const d = new Date(ts)
  if (range === "24h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (range === "7d")  return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function shortName(name: string) {
  return name.length > 22 ? name.slice(0, 20) + "…" : name
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ContainerTooltip({ active, payload, label, suffix }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] shadow-lg max-w-[220px]">
      <p className="text-muted-foreground mb-1.5">{label}</p>
      {payload.map((p: { color: string; name: string; value: number | null }) => (
        p.value != null ? (
          <p key={p.name} style={{ color: p.color }} className="font-medium">
            {shortName(p.name)}: {p.value.toFixed(1)}{suffix}
          </p>
        ) : null
      ))}
    </div>
  )
}

export function ContainerStats() {
  const [mounted, setMounted]     = useState(false)
  const [live, setLive]           = useState<LiveStat[]>([])
  const [history, setHistory]     = useState<HistoryResponse | null>(null)
  const [range, setRange]         = useState<Range>("24h")
  const [liveLoading, setLiveLoading] = useState(true)
  const [histLoading, setHistLoading] = useState(true)
  const [tab, setTab]             = useState<"cpu" | "mem">("cpu")

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch("/api/monitoring/containers/stats")
      if (res.ok) setLive(await res.json())
    } finally {
      setLiveLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async (r: Range) => {
    setHistLoading(true)
    try {
      const res = await fetch(`/api/monitoring/containers/history?range=${r}`)
      if (res.ok) setHistory(await res.json())
      else setHistory(null)
    } catch {
      setHistory(null)
    } finally {
      setHistLoading(false)
    }
  }, [])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    loadLive()
    const id = setInterval(loadLive, 60_000)
    return () => clearInterval(id)
  }, [loadLive, mounted])

  useEffect(() => { if (mounted) loadHistory(range) }, [range, loadHistory, mounted])

  if (!mounted) return <div className="rounded-xl border border-border bg-card h-[420px] animate-pulse" />

  const containers = history?.containers ?? []
  const tickCount  = range === "24h" ? 12 : range === "7d" ? 7 : 10
  const points     = (history?.points ?? []).map(p => ({
    ...p,
    label: fmtLabel(p.ts as string, range),
  }))
  const empty = !histLoading && points.length === 0

  return (
    <div className="space-y-6">
      {/* Live table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium text-foreground">Container Resource Usage</p>
          <p className="text-[11px] text-muted-foreground">Live — refreshes every 60s</p>
        </div>

        {liveLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-blue-400" />
          </div>
        ) : live.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">No running containers found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2 text-muted-foreground font-medium">Container</th>
                  <th className="px-4 py-2 text-muted-foreground font-medium text-right">CPU %</th>
                  <th className="px-4 py-2 text-muted-foreground font-medium text-right">RAM (MB)</th>
                  <th className="px-4 py-2 text-muted-foreground font-medium">CPU bar</th>
                </tr>
              </thead>
              <tbody>
                {live.map((c, i) => {
                  const cpuColor =
                    c.cpuPct > 80 ? "bg-red-400" :
                    c.cpuPct > 40 ? "bg-yellow-400" : "bg-emerald-400"
                  return (
                    <tr key={c.container} className={i % 2 === 0 ? "bg-white/[0.01]" : ""}>
                      <td className="px-4 py-2 text-foreground font-mono">{c.container}</td>
                      <td className={`px-4 py-2 text-right font-medium tabular-nums ${
                        c.cpuPct > 80 ? "text-red-400" : c.cpuPct > 40 ? "text-yellow-400" : "text-emerald-400"
                      }`}>
                        {c.cpuPct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {c.memMb.toFixed(0)}
                      </td>
                      <td className="px-4 py-2 w-32">
                        <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
                          <div
                            className={`h-full rounded-full transition-all ${cpuColor}`}
                            style={{ width: `${Math.min(100, c.cpuPct)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setTab("cpu")}
              className={`px-3 py-1 text-[11px] transition-colors ${tab === "cpu" ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"}`}
            >
              CPU %
            </button>
            <button
              onClick={() => setTab("mem")}
              className={`px-3 py-1 text-[11px] transition-colors ${tab === "mem" ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"}`}
            >
              RAM (MB)
            </button>
          </div>
          <p className="text-sm font-medium text-foreground">Top Containers — {tab === "cpu" ? "CPU Load" : "Memory"} History</p>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {RANGE_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setRange(value)}
                className={`px-3 py-1 text-[11px] transition-colors ${range === value ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {histLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-blue-400" />
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2">
            <p className="text-sm text-muted-foreground">No data yet</p>
            <p className="text-[11px] text-muted-foreground/60">Snapshots are collected every minute — check back soon.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={points} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval={Math.max(0, Math.floor(points.length / tickCount) - 1)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={v => tab === "cpu" ? `${v}%` : `${v}m`}
              />
              <Tooltip content={<ContainerTooltip suffix={tab === "cpu" ? "%" : " MB"} />} />
              <Legend
                wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
                formatter={(value) => shortName(value)}
              />
              {containers.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={`${name}__${tab === "cpu" ? "cpu" : "mem"}`}
                  name={name}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  activeDot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
