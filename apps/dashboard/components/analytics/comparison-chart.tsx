"use client"

import { useEffect, useState, useCallback } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Surface } from "@/components/ui/surface"
import { EmptyState, ErrorState } from "@/components/ui/data-states"
import { useT } from "@/components/locale-provider"
import { type Range, RangeSelector, ChartTooltip, CHART_COLORS, fmtBucketLabel, LoadingSpinner } from "./shared"

type SensorPoint = { bucket: string; sensorId: string; sensorName: string; clientId: string | null; clientName: string | null; count: number }
type ClientPoint = { bucket: string; clientId: string | null; clientName: string; count: number }
type ComparisonResponse = { bySensor: SensorPoint[]; byClient: ClientPoint[] }
type Point = { bucket: string; label: string } & Record<string, number | string>
type Tab = "bySensor" | "byClient"

function pivot(rows: Array<{ bucket: string; count: number }>, nameOf: (r: unknown) => string, range: Range): { names: string[]; points: Point[] } {
  const names = new Set<string>()
  const byBucket = new Map<string, Point>()
  for (const row of rows) {
    const name = nameOf(row)
    names.add(name)
    let point = byBucket.get(row.bucket)
    if (!point) {
      point = { bucket: row.bucket, label: fmtBucketLabel(row.bucket, range) }
      byBucket.set(row.bucket, point)
    }
    point[name] = (Number(point[name]) || 0) + row.count
  }
  return { names: [...names], points: [...byBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)) }
}

export default function ComparisonChart() {
  const t = useT()
  const [range, setRange] = useState<Range>("30d")
  const [tab, setTab] = useState<Tab>("byClient")
  const [data, setData] = useState<ComparisonResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback((r: Range, signal: AbortSignal) => {
    setLoading(true)
    setError(false)
    setUnavailable(false)
    setForbidden(false)
    fetch(`/api/analytics/comparison?range=${r}`, { signal })
      .then(async (res) => {
        if (res.status === 503) { setUnavailable(true); return }
        if (res.status === 403 || res.status === 401) { setForbidden(true); return }
        if (!res.ok) { setError(true); return }
        setData(await res.json())
      })
      .catch((err) => { if (err?.name !== "AbortError") setError(true) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(range, controller.signal)
    return () => controller.abort()
  }, [range, load])

  const { names, points } = tab === "byClient"
    ? pivot(data?.byClient ?? [], (r) => (r as ClientPoint).clientName, range)
    : pivot(data?.bySensor ?? [], (r) => (r as SensorPoint).sensorName, range)

  return (
    <Surface padded className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["byClient", "bySensor"] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`px-3 py-1 text-[11px] transition-colors ${tab === tb ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"}`}
            >
              {t(tb === "byClient" ? "analytics.comparison.tab.byClient" : "analytics.comparison.tab.bySensor")}
            </button>
          ))}
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : unavailable ? (
        <EmptyState icon="activity" title={t("analytics.unavailable.title")} description={t("analytics.unavailable.description")} />
      ) : forbidden ? (
        <EmptyState icon="shield" title={t("analytics.unavailable.title")} />
      ) : error ? (
        <ErrorState />
      ) : points.length === 0 ? (
        <EmptyState title={t("analytics.comparison.empty")} />
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={points} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
            {names.map((name, i) => (
              <Area
                key={name}
                type="monotone"
                dataKey={name}
                stackId="1"
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                fillOpacity={0.25}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Surface>
  )
}
