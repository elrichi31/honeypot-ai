"use client"

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"
import type { DashboardStats } from "@/lib/types"

interface ActivityChartProps {
  stats: DashboardStats
}

export function ActivityChart({ stats }: ActivityChartProps) {
  // Create 24-hour data
  const hours = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, "0") + ":00"
    const found = stats.eventsByHour.find((e) => e.hour === hour)
    return {
      hour,
      count: found?.count || 0,
    }
  })

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4">
        <h3 className="font-semibold text-foreground">Activity Timeline</h3>
        <p className="text-sm text-muted-foreground">Events per hour</p>
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={hours}>
            <defs>
              <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(250 60% 65%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(250 60% 65%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="hour"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(0 0% 60%)", fontSize: 11 }}
              interval={3}
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
