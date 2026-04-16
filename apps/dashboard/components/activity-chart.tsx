"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"
import type { DashboardStats, TimeRange } from "@/lib/types"

interface ActivityChartProps {
  stats: DashboardStats
  range: TimeRange
}

const RANGE_LABELS: Record<TimeRange, string> = {
  day: "24h",
  week: "7d",
  month: "30d",
}

export function ActivityChart({ stats, range }: ActivityChartProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setRange(r: TimeRange) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("range", r)
    router.push(`?${params.toString()}`)
  }

  const data = stats.timeline.map((point) => ({ label: point.label, count: point.count }))

  const xInterval = range === "day" ? 3 : range === "week" ? 0 : 4

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Activity Timeline</h3>
          <p className="text-sm text-muted-foreground">
            {range === "day" ? "Events per hour" : "Events per day"}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(["day", "week", "month"] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                range === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(250 60% 65%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(250 60% 65%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(0 0% 60%)", fontSize: 11 }}
              interval={xInterval}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(0 0% 60%)", fontSize: 11 }}
              width={30}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(0 0% 12%)",
                border: "1px solid hsl(0 0% 22%)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "hsl(0 0% 95%)" }}
              itemStyle={{ color: "hsl(250 60% 65%)" }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="hsl(250 60% 65%)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorCount)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
