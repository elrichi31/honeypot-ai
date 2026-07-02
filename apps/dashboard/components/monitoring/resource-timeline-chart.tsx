"use client"

import { useEffect, useState, useCallback } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts"
import { Surface } from "@/components/ui/surface"

type Range = "24h" | "7d" | "30d"

type Snapshot = {
  ts: string
  cpu: number
  ramPct: number
  ramUsedKb: number
  ramTotalKb: number
}

type Point = {
  label: string
  cpu: number
  ramPct: number
  ramUsedGb: number
}

function fmtLabel(ts: string, range: Range): string {
  const d = new Date(ts)
  if (range === "24h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (range === "7d")  return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function fmtGb(kb: number | null): string {
  if (kb == null) return "0.00"
  return (kb / 1024 / 1024).toFixed(2)
}

const RANGES: { label: string; value: Range }[] = [
  { label: "24h", value: "24h" },
  { label: "7d",  value: "7d"  },
  { label: "30d", value: "30d" },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CpuTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value
  if (val == null) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="text-blue-400 font-medium">Load: {Number(val).toFixed(2)}</p>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RamTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value
  if (val == null) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="text-emerald-400 font-medium">RAM: {Number(val).toFixed(1)}%</p>
    </div>
  )
}

export default function ResourceTimelineChart() {
  const [range, setRange]     = useState<Range>("24h")
  const [data, setData]       = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty]     = useState(false)

  const load = useCallback(async (r: Range, signal: AbortSignal) => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/monitoring/history?range=${r}`, { signal })
      const rows: Snapshot[] = await res.json()
      if (!Array.isArray(rows) || rows.length === 0) {
        setEmpty(true)
        setData([])
      } else {
        setEmpty(false)
        setData(rows.map(s => ({
          label:     fmtLabel(s.ts, r),
          cpu:       s.cpu ?? 0,
          ramPct:    s.ramPct ?? 0,
          ramUsedGb: parseFloat(fmtGb(s.ramUsedKb)),
        })))
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return
      setEmpty(true)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(range, controller.signal)
    return () => controller.abort()
  }, [range, load])

  const tickCount = range === "24h" ? 12 : range === "7d" ? 7 : 10

  return (
    <Surface padded className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Resource History</p>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`px-3 py-1 text-[11px] transition-colors ${
                range === value
                  ? "bg-white/[0.08] text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-blue-400" />
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center justify-center py-14 gap-2">
          <p className="text-sm text-muted-foreground">No data yet</p>
          <p className="text-[11px] text-muted-foreground/60">Snapshots are collected every minute — check back soon.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">CPU Load Average (1m)</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(data.length / tickCount) - 1)} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} />
                <Tooltip content={<CpuTooltip />} />
                <ReferenceLine y={4} stroke="rgba(239,68,68,0.3)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="cpu" stroke="#60a5fa" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#60a5fa" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">RAM Usage (%)</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(data.length / tickCount) - 1)} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} tickFormatter={v => `${v}%`} />
                <Tooltip content={<RamTooltip />} />
                <ReferenceLine y={85} stroke="rgba(239,68,68,0.3)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="ramPct" stroke="#34d399" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#34d399" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Surface>
  )
}
