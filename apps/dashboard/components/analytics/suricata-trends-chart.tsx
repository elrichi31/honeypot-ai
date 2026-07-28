"use client"

import { useEffect, useState, useCallback } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Surface } from "@/components/ui/surface"
import { EmptyState, ErrorState } from "@/components/ui/data-states"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { useT } from "@/components/locale-provider"
import { type Range, RangeSelector, ChartTooltip, CHART_COLORS, fmtBucketLabel, LoadingSpinner } from "./shared"

type GroupBy = "signature" | "category"
type TrendPoint = { bucket: string; group: string; count: number; severity: number }
type TrendTotal = { group: string; count: number; severity: number }
type Point = { bucket: string; label: string } & Record<string, number | string>

function pivot(rows: TrendPoint[], range: Range): { groups: string[]; points: Point[] } {
  const groups = [...new Set(rows.map((r) => r.group))]
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
  const [groups, setGroups] = useState<string[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [top, setTop] = useState<TrendTotal[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback((r: Range, g: GroupBy, signal: AbortSignal) => {
    setLoading(true)
    setError(false)
    setUnavailable(false)
    fetch(`/api/analytics/suricata-trends?range=${r}&groupBy=${g}&limit=10`, { signal })
      .then(async (res) => {
        if (res.status === 503) { setUnavailable(true); return }
        if (!res.ok) { setError(true); return }
        const body = (await res.json()) as { data: TrendPoint[]; top: TrendTotal[] }
        const { groups: gs, points: pts } = pivot(body.data, r)
        setGroups(gs)
        setPoints(pts)
        setTop(body.top)
      })
      .catch((err) => { if (err?.name !== "AbortError") setError(true) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(range, groupBy, controller.signal)
    return () => controller.abort()
  }, [range, groupBy, load])

  return (
    <div className="space-y-4">
      <Surface padded className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["signature", "category"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-3 py-1 text-[11px] transition-colors ${groupBy === g ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"}`}
              >
                {t(g === "signature" ? "analytics.suricataTrends.groupBy.signature" : "analytics.suricataTrends.groupBy.category")}
              </button>
            ))}
          </div>
          <RangeSelector value={range} onChange={setRange} />
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : unavailable ? (
          <EmptyState icon="shield" title={t("analytics.unavailable.title")} description={t("analytics.unavailable.description")} />
        ) : error ? (
          <ErrorState />
        ) : points.length === 0 ? (
          <EmptyState title={t("analytics.suricataTrends.empty")} />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={points} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
              {groups.map((name, i) => (
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

      {top.length > 0 && (
        <Surface className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">{t("analytics.suricataTrends.top.title")}</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("analytics.suricataTrends.col.name")}</TableHead>
                <TableHead className="text-right">{t("analytics.suricataTrends.col.count")}</TableHead>
                <TableHead className="text-right">{t("analytics.suricataTrends.col.severity")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((row) => (
                <TableRow key={row.group}>
                  <TableCell className="text-xs">{row.group}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.count.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.severity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      )}
    </div>
  )
}
