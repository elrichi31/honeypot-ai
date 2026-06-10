"use client"

import { useEffect, useState, useCallback } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts"
import { Surface } from "@/components/ui/surface"

type Range   = "24h" | "7d" | "30d"
type DayEntry = { period: string; ssh: number; web: number; protocol: number; defense: number }

const RANGES: { key: Range; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d",  label: "7d"  },
  { key: "30d", label: "30d" },
]

const SERIES = [
  { key: "ssh",      label: "SSH",      color: "#60a5fa" },
  { key: "web",      label: "Web",      color: "#34d399" },
  { key: "protocol", label: "Protocol", color: "#f59e0b" },
  { key: "defense",  label: "Defense",  color: "#f87171" },
] as const

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function fmtLabel(iso: string, range: Range): string {
  const d = new Date(iso)
  if (range === "24h") {
    return `${String(d.getHours()).padStart(2, "0")}:00`
  }
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + p.value, 0)
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="tabular-nums text-foreground">{fmtBytes(p.value)}</span>
        </div>
      ))}
      <div className="mt-1 border-t border-border/50 pt-1 font-medium text-foreground">
        Total: {fmtBytes(total)}
      </div>
    </div>
  )
}

export function IngestionChart() {
  const [range, setRange]   = useState<Range>("7d")
  const [data, setData]     = useState<DayEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback((r: Range) => {
    setLoading(true)
    fetch(`/api/storage/ingestion?range=${r}`)
      .then(res => res.json())
      .then((d: unknown) => setData(Array.isArray(d) ? d : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(range) }, [range, load])

  const display = data.map(d => ({ ...d, label: fmtLabel(d.period, range) }))

  return (
    <Surface className="px-4 pt-4 pb-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-foreground">Daily Ingestion</p>
        <div className="flex gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                range === r.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">Estimated storage written per period</p>

      {loading ? (
        <div className="flex items-center justify-center h-[220px]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-blue-400" />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={display}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false}
              interval={range === "30d" ? 4 : range === "24h" ? 2 : 0}
            />
            <YAxis
              tickFormatter={fmtBytes}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false} tickLine={false}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
            <Legend
              iconType="circle" iconSize={6}
              formatter={v => <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{v}</span>}
            />
            {SERIES.map(s => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Surface>
  )
}
