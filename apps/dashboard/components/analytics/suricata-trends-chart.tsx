"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, Crosshair, Layers3, ShieldAlert } from "lucide-react"
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
  compactNumber, fmtBucketLabel, LoadingSpinner, type Range, RangeSelector,
} from "./shared"

type GroupBy = "signature" | "category"
type TrendPoint = { bucket: string; group: string; count: number; severity: number }
type TrendTotal = { group: string; count: number; severity: number }
type Point = { bucket: string; label: string } & Record<string, number | string>

// Same severity→color convention as /suricata (app/suricata/suricata-client.tsx SEVERITY_CONFIG).
const SEVERITY_COLOR: Record<number, string> = { 1: "#f87171", 2: "#fb923c", 3: "#facc15", 4: "#60a5fa" }
function severityColor(severity: number): string {
  return SEVERITY_COLOR[severity] ?? SEVERITY_COLOR[4]
}

function pivot(rows: TrendPoint[], range: Range): { groups: string[]; points: Point[] } {
  const groups = [...new Set(rows.map((row) => row.group))]
  const byBucket = new Map<string, Point>()
  for (const row of rows) {
    let point = byBucket.get(row.bucket)
    if (!point) {
      point = { bucket: row.bucket, label: fmtBucketLabel(row.bucket, range) }
      byBucket.set(row.bucket, point)
    }
    point[row.group] = row.count
  }
  return { groups, points: [...byBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)) }
}

export default function SuricataTrendsChart() {
  const t = useT()
  const [range, setRange] = useState<Range>("90d")
  const [groupBy, setGroupBy] = useState<GroupBy>("signature")
  const [mode, setMode] = useState<ChartMode>("area")
  const [groups, setGroups] = useState<string[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [top, setTop] = useState<TrendTotal[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback((selectedRange: Range, selectedGroup: GroupBy, signal: AbortSignal) => {
    setLoading(true)
    setError(false)
    setUnavailable(false)
    fetch(`/api/analytics/suricata-trends?range=${selectedRange}&groupBy=${selectedGroup}&limit=10`, { signal })
      .then(async (response) => {
        if (response.status === 503) { setUnavailable(true); return }
        if (!response.ok) { setError(true); return }
        const body = (await response.json()) as { data: TrendPoint[]; top: TrendTotal[] }
        const next = pivot(body.data, selectedRange)
        setGroups(next.groups)
        setPoints(next.points)
        setTop(body.top)
      })
      .catch((fetchError) => { if (fetchError?.name !== "AbortError") setError(true) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(range, groupBy, controller.signal)
    return () => controller.abort()
  }, [range, groupBy, load])

  const summary = useMemo(() => {
    const visibleAlerts = top.reduce((sum, row) => sum + row.count, 0)
    const priorityOne = top.filter((row) => row.severity === 1).length
    const concentration = visibleAlerts && top[0] ? (top[0].count / visibleAlerts) * 100 : 0
    return { visibleAlerts, priorityOne, concentration }
  }, [top])

  const severityByGroup = useMemo(() => new Map(top.map((row) => [row.group, row.severity])), [top])
  const colorForGroup = useCallback(
    (group: string) => severityColor(severityByGroup.get(group) ?? 4),
    [severityByGroup],
  )

  const modeLabels = {
    area: t("analytics.chart.area"),
    bar: t("analytics.chart.bar"),
    line: t("analytics.chart.line"),
  }

  if (loading) return <Surface><LoadingSpinner /></Surface>
  if (unavailable) return <Surface><EmptyState icon="shield" title={t("analytics.unavailable.title")} description={t("analytics.unavailable.description")} /></Surface>
  if (error) return <Surface><ErrorState /></Surface>
  if (points.length === 0) return <Surface><EmptyState title={t("analytics.suricataTrends.empty")} /></Surface>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="inline-flex rounded-lg border border-border bg-background/50 p-0.5">
          {(["signature", "category"] as const).map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setGroupBy(group)}
              aria-pressed={groupBy === group}
              className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${groupBy === group ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t(group === "signature" ? "analytics.suricataTrends.groupBy.signature" : "analytics.suricataTrends.groupBy.category")}
            </button>
          ))}
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("analytics.suricataTrends.metric.visible")} value={compactNumber(summary.visibleAlerts)} sub={t("analytics.suricataTrends.metric.topTen")} icon={<Activity className="h-4 w-4 text-sky-400" />} mono />
        <StatCard label={t("analytics.suricataTrends.metric.groups")} value={String(top.length)} sub={groupBy === "signature" ? t("analytics.suricataTrends.groupBy.signature") : t("analytics.suricataTrends.groupBy.category")} icon={<Layers3 className="h-4 w-4 text-emerald-400" />} mono />
        <StatCard label={t("analytics.suricataTrends.metric.priorityOne")} value={String(summary.priorityOne)} sub={t("analytics.suricataTrends.metric.highestPriority")} icon={<ShieldAlert className="h-4 w-4 text-rose-400" />} mono />
        <StatCard label={t("analytics.suricataTrends.metric.concentration")} value={`${summary.concentration.toFixed(1)}%`} sub={top[0]?.group ?? "—"} icon={<Crosshair className="h-4 w-4 text-amber-400" />} mono />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Surface padded className="min-w-0 space-y-5 overflow-hidden">
          <ChartHeader
            eyebrow={t("analytics.signal.eyebrow")}
            title={t("analytics.suricataTrends.title")}
            description={t("analytics.suricataTrends.description")}
            actions={<ChartModeSelector value={mode} onChange={setMode} labels={modeLabels} />}
          />
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={points} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
              <defs>
                {groups.map((group, index) => (
                  <linearGradient key={group} id={`suricata-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorForGroup(group)} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={colorForGroup(group)} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.055)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={46} tickFormatter={compactNumber} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} formatter={(value) => String(value).length > 28 ? `${String(value).slice(0, 28)}…` : value} />
              {groups.map((group, index) => {
                const shared = { key: group, dataKey: group, name: group, stroke: colorForGroup(group) }
                if (mode === "bar") return <Bar {...shared} stackId="alerts" fill={colorForGroup(group)} fillOpacity={0.72} radius={[2, 2, 0, 0]} />
                if (mode === "line") return <Line {...shared} type="monotone" strokeWidth={2} dot={false} />
                return <Area {...shared} type="monotone" stackId="alerts" fill={`url(#suricata-${index})`} strokeWidth={1.5} />
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </Surface>

        <Surface padded className="space-y-4">
          <ChartHeader title={t("analytics.suricataTrends.top.title")} description={t("analytics.suricataTrends.top.description")} />
          <div className="relative">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={top} dataKey="count" nameKey="group" innerRadius={54} outerRadius={78} paddingAngle={2} stroke="transparent">
                  {top.map((row) => <Cell key={row.group} fill={severityColor(row.severity)} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-xl font-semibold text-foreground">{compactNumber(summary.visibleAlerts)}</span>
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{t("analytics.suricataTrends.col.count")}</span>
            </div>
          </div>
          <div className="space-y-3">
            {top.slice(0, 6).map((row, index) => (
              <div key={row.group} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="truncate text-muted-foreground" title={row.group}>{index + 1}. {row.group}</span>
                  <span className="shrink-0 font-mono text-foreground">{compactNumber(row.count)}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full rounded-full" style={{ width: `${top[0] ? (row.count / top[0].count) * 100 : 0}%`, backgroundColor: severityColor(row.severity) }} />
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  )
}
