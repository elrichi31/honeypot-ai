"use client"

import { useEffect, useState, useCallback } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Surface } from "@/components/ui/surface"
import { EmptyState, ErrorState } from "@/components/ui/data-states"
import { useT } from "@/components/locale-provider"

type Range = "7d" | "30d" | "90d" | "1y"
type TrendBucket = { bucket: string; protocol: string; count: number }
type TrendsResponse = { data: TrendBucket[] }
type Point = { bucket: string; label: string } & Record<string, number | string>

const RANGE_OPTIONS: { label: string; value: Range }[] = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "1y", value: "1y" },
]

const COLORS = ["#60a5fa", "#34d399", "#f59e0b", "#f87171", "#a78bfa", "#fb923c", "#22d3ee"]

function fmtLabel(bucket: string, range: Range): string {
  const d = new Date(bucket.replace(" ", "T"))
  if (range === "7d") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (range === "1y") return d.toLocaleDateString([], { month: "short", day: "numeric" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

// Flattens the API's {bucket, protocol, count}[] into one row per bucket with
// one numeric column per protocol — same pivot approach as
// container-stats-chart.tsx's HistoryResponse handling.
function pivot(rows: TrendBucket[], range: Range): { protocols: string[]; points: Point[] } {
  const protocols = [...new Set(rows.map((r) => r.protocol))].sort()
  const byBucket = new Map<string, Point>()

  for (const row of rows) {
    let point = byBucket.get(row.bucket)
    if (!point) {
      point = { bucket: row.bucket, label: fmtLabel(row.bucket, range) }
      byBucket.set(row.bucket, point)
    }
    point[row.protocol] = row.count
  }

  const points = [...byBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket))
  return { protocols, points }
}

export default function TrendsChart() {
  const t = useT()
  const [range, setRange] = useState<Range>("30d")
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [protocols, setProtocols] = useState<string[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback((r: Range, signal: AbortSignal) => {
    setLoading(true)
    setError(false)
    setUnavailable(false)
    fetch(`/api/analytics/trends?range=${r}`, { signal })
      .then(async (res) => {
        if (res.status === 503) { setUnavailable(true); return }
        if (!res.ok) { setError(true); return }
        const body = (await res.json()) as TrendsResponse
        const { protocols: p, points: pts } = pivot(body.data, r)
        setProtocols(p)
        setPoints(pts)
      })
      .catch((err) => { if (err?.name !== "AbortError") setError(true) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(range, controller.signal)
    return () => controller.abort()
  }, [range, load])

  function toggleProtocol(name: string) {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <Surface padded className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium text-foreground">{t("analytics.trends.title")}</p>
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

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-blue-400" />
        </div>
      ) : unavailable ? (
        <EmptyState icon="activity" title={t("analytics.unavailable.title")} description={t("analytics.unavailable.description")} />
      ) : error ? (
        <ErrorState />
      ) : points.length === 0 ? (
        <EmptyState title={t("analytics.trends.empty.title")} description={t("analytics.trends.empty.description")} />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={points} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
            />
            <Legend
              wrapperStyle={{ fontSize: "10px", paddingTop: "8px", cursor: "pointer" }}
              onClick={(e) => toggleProtocol(String(e.dataKey))}
              formatter={(value) => (hidden.has(String(value)) ? `${value} (hidden)` : value)}
            />
            {protocols.map((name, i) => (
              <Area
                key={name}
                type="monotone"
                dataKey={name}
                stackId="1"
                stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={0.25}
                hide={hidden.has(name)}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Surface>
  )
}
