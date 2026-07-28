"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, Building2, Gauge, Trophy } from "lucide-react"
import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { Surface } from "@/components/ui/surface"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState, ErrorState } from "@/components/ui/data-states"
import { useT } from "@/components/locale-provider"
import {
  type ChartMode, ChartHeader, ChartModeSelector, ChartTooltip,
  CHART_COLORS, compactNumber, fmtBucketLabel, LoadingSpinner, type Range, RangeSelector,
} from "./shared"

type SensorPoint = { bucket: string; sensorId: string; sensorName: string; clientId: string | null; clientName: string | null; count: number }
type ClientPoint = { bucket: string; clientId: string | null; clientName: string; count: number }
type ComparisonResponse = { bySensor: SensorPoint[]; byClient: ClientPoint[] }
type Point = { bucket: string; label: string } & Record<string, number | string>
type Tab = "bySensor" | "byClient"

function pivot(rows: Array<{ bucket: string; count: number }>, nameOf: (row: unknown) => string, range: Range) {
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
  const [mode, setMode] = useState<ChartMode>("area")
  const [data, setData] = useState<ComparisonResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback((selectedRange: Range, signal: AbortSignal) => {
    setLoading(true)
    setError(false)
    setUnavailable(false)
    setForbidden(false)
    fetch(`/api/analytics/comparison?range=${selectedRange}`, { signal })
      .then(async (response) => {
        if (response.status === 503) { setUnavailable(true); return }
        if (response.status === 403 || response.status === 401) { setForbidden(true); return }
        if (!response.ok) { setError(true); return }
        setData(await response.json())
      })
      .catch((fetchError) => { if (fetchError?.name !== "AbortError") setError(true) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(range, controller.signal)
    return () => controller.abort()
  }, [range, load])

  const { names, points } = tab === "byClient"
    ? pivot(data?.byClient ?? [], (row) => (row as ClientPoint).clientName, range)
    : pivot(data?.bySensor ?? [], (row) => (row as SensorPoint).sensorName, range)

  const summary = useMemo(() => {
    const totals = names.map((name) => ({
      name,
      value: points.reduce((sum, point) => sum + Number(point[name] ?? 0), 0),
    })).sort((a, b) => b.value - a.value)
    const total = totals.reduce((sum, item) => sum + item.value, 0)
    return {
      totals,
      total,
      leader: totals[0],
      concentration: total && totals[0] ? (totals[0].value / total) * 100 : 0,
    }
  }, [names, points])

  const modeLabels = {
    area: t("analytics.chart.area"),
    bar: t("analytics.chart.bar"),
    line: t("analytics.chart.line"),
  }

  if (loading) return <Surface><LoadingSpinner /></Surface>
  if (unavailable) return <Surface><EmptyState icon="activity" title={t("analytics.unavailable.title")} description={t("analytics.unavailable.description")} /></Surface>
  if (forbidden) return <Surface><EmptyState icon="shield" title={t("analytics.comparison.forbidden")} /></Surface>
  if (error) return <Surface><ErrorState /></Surface>
  if (points.length === 0) return <Surface><EmptyState title={t("analytics.comparison.empty")} /></Surface>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="inline-flex rounded-lg border border-border bg-background/50 p-0.5">
          {(["byClient", "bySensor"] as const).map((selectedTab) => (
            <button
              key={selectedTab}
              type="button"
              onClick={() => setTab(selectedTab)}
              aria-pressed={tab === selectedTab}
              className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${tab === selectedTab ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t(selectedTab === "byClient" ? "analytics.comparison.tab.byClient" : "analytics.comparison.tab.bySensor")}
            </button>
          ))}
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("analytics.comparison.metric.events")} value={compactNumber(summary.total)} sub={t("analytics.metric.selectedRange")} icon={<Activity className="h-4 w-4 text-sky-400" />} mono />
        <StatCard label={t("analytics.comparison.metric.entities")} value={String(names.length)} sub={tab === "byClient" ? t("analytics.comparison.tab.byClient") : t("analytics.comparison.tab.bySensor")} icon={<Building2 className="h-4 w-4 text-emerald-400" />} mono />
        <StatCard label={t("analytics.comparison.metric.leader")} value={summary.leader ? compactNumber(summary.leader.value) : "—"} sub={summary.leader?.name ?? "—"} icon={<Trophy className="h-4 w-4 text-amber-400" />} mono />
        <StatCard label={t("analytics.comparison.metric.concentration")} value={`${summary.concentration.toFixed(1)}%`} sub={t("analytics.comparison.metric.leadingShare")} icon={<Gauge className="h-4 w-4 text-violet-400" />} mono />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Surface padded className="min-w-0 space-y-5 overflow-hidden">
          <ChartHeader
            eyebrow={t("analytics.signal.eyebrow")}
            title={t("analytics.comparison.title")}
            description={t("analytics.comparison.chartDescription")}
            actions={<ChartModeSelector value={mode} onChange={setMode} labels={modeLabels} />}
          />
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={points} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
              <defs>
                {names.map((name, index) => (
                  <linearGradient key={name} id={`comparison-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.055)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={46} tickFormatter={compactNumber} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} />
              {names.map((name, index) => {
                const shared = { key: name, dataKey: name, name, stroke: CHART_COLORS[index % CHART_COLORS.length] }
                if (mode === "bar") return <Bar {...shared} stackId="events" fill={CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={0.72} radius={[2, 2, 0, 0]} />
                if (mode === "line") return <Line {...shared} type="monotone" strokeWidth={2} dot={false} />
                return <Area {...shared} type="monotone" stackId="events" fill={`url(#comparison-${index})`} strokeWidth={1.5} />
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </Surface>

        <Surface padded className="space-y-4">
          <ChartHeader title={t("analytics.comparison.share.title")} description={t("analytics.comparison.share.description")} />
          <div className="relative">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={summary.totals} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={2} stroke="transparent">
                  {summary.totals.map((item, index) => <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-2xl font-semibold text-foreground">{names.length}</span>
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{t("analytics.comparison.metric.entities")}</span>
            </div>
          </div>
          <div className="space-y-2.5">
            {summary.totals.slice(0, 6).map((item, index) => (
              <div key={item.name} className="flex items-center gap-2 text-[11px]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.name}</span>
                <span className="font-mono text-foreground">{summary.total ? ((item.value / summary.total) * 100).toFixed(1) : 0}%</span>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  )
}
