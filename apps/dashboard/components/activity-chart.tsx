"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import type { DashboardStats, TimeRange } from "@/lib/types"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  Sesiones: {
    label: "Sesiones",
    color: "hsl(250 60% 65%)",
  },
  Comprometidas: {
    label: "Comprometidas",
    color: "hsl(0 84% 60%)",
  },
} satisfies ChartConfig

const RANGE_LABELS: Record<TimeRange, string> = {
  day: "24h",
  week: "7d",
  month: "30d",
}

interface ActivityChartProps {
  stats: DashboardStats
  range: TimeRange
}

export function ActivityChart({ stats, range }: ActivityChartProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setRange(r: TimeRange) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("range", r)
    router.push(`?${params.toString()}`)
  }

  const data = stats.timeline.map((point) => ({
    label: point.label,
    Sesiones: point.sessions,
    Comprometidas: point.successfulLogins,
  }))

  const xInterval = range === "day" ? 3 : range === "week" ? 0 : 4

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Actividad en el tiempo</h3>
          <p className="text-sm text-muted-foreground">
            {range === "day" ? "Sesiones por hora" : "Sesiones por día"}
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

      <ChartContainer config={chartConfig} className="aspect-auto h-[220px]">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-Sesiones)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--color-Sesiones)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradCompromised" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-Comprometidas)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-Comprometidas)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} interval={xInterval} />
          <YAxis axisLine={false} tickLine={false} width={30} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Area
            type="monotone"
            dataKey="Sesiones"
            stroke="var(--color-Sesiones)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#gradSessions)"
          />
          <Area
            type="monotone"
            dataKey="Comprometidas"
            stroke="var(--color-Comprometidas)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#gradCompromised)"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
