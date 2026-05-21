"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import type { CrossSensorTimeline } from "@/lib/api"
import type { TimeRange } from "@/lib/types"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"

const RANGE_LABELS: Record<TimeRange, string> = { day: "24h", week: "7d", month: "30d" }

const SOURCE_COLORS: Record<string, string> = {
  ssh:         "hsl(250 60% 65%)",
  web:         "hsl(199 89% 60%)",
  ftp:         "hsl(48 96% 53%)",
  mysql:       "hsl(270 60% 65%)",
  "port-scan": "hsl(217 91% 60%)",
  smb:         "hsl(25 95% 60%)",
  mssql:       "hsl(330 70% 65%)",
  mqtt:        "hsl(174 72% 56%)",
  rpc:         "hsl(239 68% 65%)",
  tftp:        "hsl(84 80% 50%)",
}

function colorFor(key: string) {
  return SOURCE_COLORS[key] ?? `hsl(${(key.charCodeAt(0) * 37) % 360} 60% 60%)`
}

function gradId(key: string) {
  return `grad_${key.replace(/[^a-z0-9]/gi, "_")}`
}

interface Props {
  timeline: CrossSensorTimeline
  range: TimeRange
}

export function CrossSensorActivityChart({ timeline, range }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setRange(r: TimeRange) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("range", r)
    router.push(`?${params.toString()}`)
  }

  const sources = ["ssh", "web", ...timeline.activeProtocols]
  const activeSources = sources.filter((s) =>
    timeline.buckets.some((b) => (b[s] as number) > 0)
  )

  const chartConfig = Object.fromEntries(
    activeSources.map((s) => [s, { label: s.toUpperCase(), color: colorFor(s) }])
  ) as ChartConfig

  const xInterval = range === "day" ? 3 : range === "week" ? 0 : 4

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Actividad en el tiempo</h3>
          <p className="text-sm text-muted-foreground">
            Eventos por {range === "day" ? "hora" : "día"} · todos los sensores
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
        <AreaChart data={timeline.buckets as Record<string, unknown>[]}>
          <defs>
            {activeSources.map((s) => (
              <linearGradient key={s} id={gradId(s)} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={colorFor(s)} stopOpacity={0.25} />
                <stop offset="95%" stopColor={colorFor(s)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} interval={xInterval} />
          <YAxis axisLine={false} tickLine={false} width={35} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {activeSources.map((s) => (
            <Area
              key={s}
              type="monotone"
              dataKey={s}
              stroke={colorFor(s)}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#${gradId(s)})`}
              stackId="all"
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
