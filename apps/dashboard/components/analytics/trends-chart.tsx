"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, Gauge, Layers3, TrendingUp } from "lucide-react"
import {
  Area, Bar, Brush, CartesianGrid, Cell, ComposedChart, Legend, Line,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { Surface } from "@/components/ui/surface"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState, ErrorState } from "@/components/ui/data-states"
import { useT } from "@/components/locale-provider"
import { useTimezone } from "@/components/timezone-provider"
import { getProtocolMarkerColor } from "@/lib/protocol-colors"
import {
  CHART_COLORS, type ChartMode, ChartHeader, ChartModeSelector, ChartTooltip,
  compactNumber, fmtBucketLabel, LoadingSpinner, percentChange,
  type Range, RangeSelector,
} from "./shared"

type Breakdown = "protocol" | "sensor"
type TrendBucket = { bucket: string; protocol: string; count: number }
type TrendsResponse = { data: TrendBucket[] }
type SensorTrendBucket = { bucket: string; sensorId: string; sensorName: string; count: number }
type SensorTrendsResponse = { data: SensorTrendBucket[] }
type Point = { bucket: string; label: string } & Record<string, number | string>

// Colors are only meaningful per-protocol (lib/protocol-colors.ts is keyed by
// protocol name) — sensor names have no canonical color, so they fall back to
// the same index-cycled palette comparison-chart.tsx uses for client/sensor series.
function colorFor(breakdown: Breakdown, name: string, index: number): string {
  return breakdown === "protocol" ? getProtocolMarkerColor(name) : CHART_COLORS[index % CHART_COLORS.length]
}

// `protocols`/`row.protocol` below double as the generic "series key" — when
// breakdown is "sensor" it holds the sensor name, not a protocol.
function pivot(rows: TrendBucket[], range: Range, timezone: string): { protocols: string[]; points: Point[] } {
  const protocols = [...new Set(rows.map((row) => row.protocol))].sort()
  const byBucket = new Map<string, Point>()

  for (const row of rows) {
    let point = byBucket.get(row.bucket)
    if (!point) {
      point = { bucket: row.bucket, label: fmtBucketLabel(row.bucket, range, timezone) }
      byBucket.set(row.bucket, point)
    }
    point[row.protocol] = Number(row.count)
  }

  return {
    protocols,
    points: [...byBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
  }
}

function pointTotal(point: Point, protocols: string[]) {
  return protocols.reduce((total, protocol) => total + Number(point[protocol] ?? 0), 0)
}

export default function TrendsChart() {
  const t = useT()
  const tz = useTimezone()
  const [range, setRange] = useState<Range>("30d")
  const [breakdown, setBreakdown] = useState<Breakdown>("protocol")
  const [mode, setMode] = useState<ChartMode>("area")
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [protocols, setProtocols] = useState<string[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback((selectedRange: Range, selectedBreakdown: Breakdown, timezone: string, signal: AbortSignal) => {
    setLoading(true)
    setError(false)
    setUnavailable(false)
    const url = selectedBreakdown === "protocol"
      ? `/api/analytics/trends?range=${selectedRange}`
      : `/api/analytics/trends/by-sensor?range=${selectedRange}`
    fetch(url, { signal })
      .then(async (response) => {
        if (response.status === 503) { setUnavailable(true); return }
        if (!response.ok) { setError(true); return }
        const rows = selectedBreakdown === "protocol"
          ? (await response.json() as TrendsResponse).data
          : (await response.json() as SensorTrendsResponse).data.map((row) => ({
              bucket: row.bucket, protocol: row.sensorName, count: row.count,
            }))
        const next = pivot(rows, selectedRange, timezone)
        setProtocols(next.protocols)
        setPoints(next.points)
        setHidden(new Set())
      })
      .catch((fetchError) => { if (fetchError?.name !== "AbortError") setError(true) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(range, breakdown, tz, controller.signal)
    return () => controller.abort()
  }, [range, breakdown, tz, load])

  const summary = useMemo(() => {
    const totals = protocols.map((protocol) => ({
      name: protocol,
      value: points.reduce((total, point) => total + Number(point[protocol] ?? 0), 0),
    })).sort((a, b) => b.value - a.value)
    const bucketTotals = points.map((point) => ({ point, value: pointTotal(point, protocols) }))
    const total = totals.reduce((sum, item) => sum + item.value, 0)
    const peak = bucketTotals.reduce((best, current) => current.value > best.value ? current : best, bucketTotals[0] ?? { point: null, value: 0 })
    const midpoint = Math.max(1, Math.floor(bucketTotals.length / 2))
    const previous = bucketTotals.slice(0, midpoint).reduce((sum, item) => sum + item.value, 0)
    const current = bucketTotals.slice(midpoint).reduce((sum, item) => sum + item.value, 0)
    return { totals, total, peak, momentum: percentChange(current, previous) }
  }, [points, protocols])

  function toggleProtocol(name: string) {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const modeLabels = {
    area: t("analytics.chart.area"),
    bar: t("analytics.chart.bar"),
    line: t("analytics.chart.line"),
  }

  if (loading) return <Surface><LoadingSpinner /></Surface>
  if (unavailable) return <Surface><EmptyState icon="activity" title={t("analytics.unavailable.title")} description={t("analytics.unavailable.description")} /></Surface>
  if (error) return <Surface><ErrorState /></Surface>
  if (points.length === 0) return <Surface><EmptyState title={t("analytics.trends.empty.title")} description={t("analytics.trends.empty.description")} /></Surface>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="inline-flex rounded-lg border border-border bg-background/50 p-0.5">
          {(["protocol", "sensor"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setBreakdown(option)}
              aria-pressed={breakdown === option}
              className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${breakdown === option ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t(option === "protocol" ? "analytics.trends.breakdown.protocol" : "analytics.trends.breakdown.sensor")}
            </button>
          ))}
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("analytics.metric.events")}
          value={compactNumber(summary.total)}
          sub={t("analytics.metric.selectedRange")}
          icon={<Activity className="h-4 w-4 text-sky-400" />}
          mono
        />
        <StatCard
          label={breakdown === "protocol" ? t("analytics.metric.protocols") : t("analytics.metric.sensors")}
          value={String(protocols.length)}
          sub={summary.totals[0]?.name ?? "—"}
          icon={<Layers3 className="h-4 w-4 text-emerald-400" />}
          mono
        />
        <StatCard
          label={t("analytics.metric.peak")}
          value={compactNumber(summary.peak.value)}
          sub={summary.peak.point ? String(summary.peak.point.label) : "—"}
          icon={<Gauge className="h-4 w-4 text-amber-400" />}
          mono
        />
        <StatCard
          label={t("analytics.metric.momentum")}
          value={summary.momentum == null ? t("analytics.metric.new") : `${summary.momentum > 0 ? "+" : ""}${summary.momentum.toFixed(1)}%`}
          sub={t("analytics.metric.periodComparison")}
          icon={<TrendingUp className="h-4 w-4 text-rose-400" />}
          mono
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Surface padded className="min-w-0 space-y-5 overflow-hidden">
          <ChartHeader
            eyebrow={t("analytics.signal.eyebrow")}
            title={t("analytics.trends.title")}
            description={t("analytics.trends.description")}
            actions={<ChartModeSelector value={mode} onChange={setMode} labels={modeLabels} />}
          />

          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={points} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
              <defs>
                {protocols.map((protocol, index) => (
                  <linearGradient key={protocol} id={`trend-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorFor(breakdown, protocol, index)} stopOpacity={0.42} />
                    <stop offset="100%" stopColor={colorFor(breakdown, protocol, index)} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.055)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={46} tickFormatter={compactNumber} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.025)" }} />
              <Legend
                wrapperStyle={{ fontSize: "10px", paddingTop: "10px", cursor: "pointer" }}
                onClick={(event) => toggleProtocol(String(event.dataKey))}
                formatter={(value) => <span className={hidden.has(String(value)) ? "opacity-35" : ""}>{value}</span>}
              />
              {protocols.map((protocol, index) => {
                const shared = {
                  key: protocol,
                  dataKey: protocol,
                  name: protocol,
                  hide: hidden.has(protocol),
                  stroke: colorFor(breakdown, protocol, index),
                }
                if (mode === "bar") return <Bar {...shared} stackId="events" fill={colorFor(breakdown, protocol, index)} fillOpacity={0.72} radius={[2, 2, 0, 0]} />
                if (mode === "line") return <Line {...shared} type="monotone" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                return <Area {...shared} type="monotone" stackId="events" fill={`url(#trend-${index})`} strokeWidth={1.6} />
              })}
              <Brush dataKey="label" height={22} travellerWidth={8} stroke="rgba(56,189,248,.45)" fill="rgba(255,255,255,.025)" />
            </ComposedChart>
          </ResponsiveContainer>
        </Surface>

        <Surface padded className="space-y-4">
          <ChartHeader
            title={breakdown === "protocol" ? t("analytics.distribution.title") : t("analytics.distribution.title.sensor")}
            description={breakdown === "protocol" ? t("analytics.distribution.description") : t("analytics.distribution.description.sensor")}
          />
          <div className="relative">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={summary.totals} dataKey="value" nameKey="name" innerRadius={66} outerRadius={92} paddingAngle={2} stroke="transparent">
                  {summary.totals.map((item, index) => <Cell key={item.name} fill={colorFor(breakdown, item.name, index)} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-2xl font-semibold text-foreground">{compactNumber(summary.total)}</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("analytics.metric.events")}</span>
            </div>
          </div>
          <div className="space-y-2.5">
            {summary.totals.slice(0, 6).map((item, index) => (
              <button
                type="button"
                key={item.name}
                onClick={() => toggleProtocol(item.name)}
                className="group flex w-full items-center gap-2 text-left text-xs"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(breakdown, item.name, index) }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground group-hover:text-foreground">{item.name}</span>
                <span className="font-mono tabular-nums text-foreground">{summary.total ? ((item.value / summary.total) * 100).toFixed(1) : 0}%</span>
              </button>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  )
}
