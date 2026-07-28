"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, Gauge, Layers3, TrendingUp } from "lucide-react"
import {
  Area, Bar, Brush, CartesianGrid, Cell, ComposedChart, Legend, Line,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { Surface } from "@/components/ui/surface"
import { EmptyState, ErrorState } from "@/components/ui/data-states"
import { useT } from "@/components/locale-provider"
import {
  AnalyticsMetric, type ChartMode, ChartHeader, ChartModeSelector, ChartTooltip,
  CHART_COLORS, compactNumber, fmtBucketLabel, LoadingSpinner, percentChange,
  type Range, RangeSelector,
} from "./shared"

type TrendBucket = { bucket: string; protocol: string; count: number }
type TrendsResponse = { data: TrendBucket[] }
type Point = { bucket: string; label: string } & Record<string, number | string>

function pivot(rows: TrendBucket[], range: Range): { protocols: string[]; points: Point[] } {
  const protocols = [...new Set(rows.map((row) => row.protocol))].sort()
  const byBucket = new Map<string, Point>()

  for (const row of rows) {
    let point = byBucket.get(row.bucket)
    if (!point) {
      point = { bucket: row.bucket, label: fmtBucketLabel(row.bucket, range) }
      byBucket.set(row.bucket, point)
    }
    point[row.protocol] = row.count
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
  const [range, setRange] = useState<Range>("30d")
  const [mode, setMode] = useState<ChartMode>("area")
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [protocols, setProtocols] = useState<string[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback((selectedRange: Range, signal: AbortSignal) => {
    setLoading(true)
    setError(false)
    setUnavailable(false)
    fetch(`/api/analytics/trends?range=${selectedRange}`, { signal })
      .then(async (response) => {
        if (response.status === 503) { setUnavailable(true); return }
        if (!response.ok) { setError(true); return }
        const body = (await response.json()) as TrendsResponse
        const next = pivot(body.data, selectedRange)
        setProtocols(next.protocols)
        setPoints(next.points)
        setHidden(new Set())
      })
      .catch((fetchError) => { if (fetchError?.name !== "AbortError") setError(true) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(range, controller.signal)
    return () => controller.abort()
  }, [range, load])

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
      <div className="flex justify-end">
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetric
          label={t("analytics.metric.events")}
          value={compactNumber(summary.total)}
          detail={t("analytics.metric.selectedRange")}
          icon={<Activity className="h-4 w-4" />}
          tone="sky"
        />
        <AnalyticsMetric
          label={t("analytics.metric.protocols")}
          value={String(protocols.length)}
          detail={summary.totals[0]?.name ?? "—"}
          icon={<Layers3 className="h-4 w-4" />}
          tone="emerald"
        />
        <AnalyticsMetric
          label={t("analytics.metric.peak")}
          value={compactNumber(summary.peak.value)}
          detail={summary.peak.point ? String(summary.peak.point.label) : "—"}
          icon={<Gauge className="h-4 w-4" />}
          tone="amber"
        />
        <AnalyticsMetric
          label={t("analytics.metric.momentum")}
          value={summary.momentum == null ? t("analytics.metric.new") : `${summary.momentum > 0 ? "+" : ""}${summary.momentum.toFixed(1)}%`}
          detail={t("analytics.metric.periodComparison")}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="rose"
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
                    <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.42} />
                    <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.02} />
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
                  stroke: CHART_COLORS[index % CHART_COLORS.length],
                }
                if (mode === "bar") return <Bar {...shared} stackId="events" fill={CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={0.72} radius={[2, 2, 0, 0]} />
                if (mode === "line") return <Line {...shared} type="monotone" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                return <Area {...shared} type="monotone" stackId="events" fill={`url(#trend-${index})`} strokeWidth={1.6} />
              })}
              <Brush dataKey="label" height={22} travellerWidth={8} stroke="rgba(56,189,248,.45)" fill="rgba(255,255,255,.025)" />
            </ComposedChart>
          </ResponsiveContainer>
        </Surface>

        <Surface padded className="space-y-4">
          <ChartHeader title={t("analytics.distribution.title")} description={t("analytics.distribution.description")} />
          <div className="relative">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={summary.totals} dataKey="value" nameKey="name" innerRadius={66} outerRadius={92} paddingAngle={2} stroke="transparent">
                  {summary.totals.map((item, index) => <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
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
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
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
