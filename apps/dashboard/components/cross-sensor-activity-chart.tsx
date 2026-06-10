"use client"

import { useState, useCallback } from "react"
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
import { useTimezone } from "@/components/timezone-provider"
import { useT } from "@/components/locale-provider"

const RANGE_LABELS: Record<TimeRange, string> = { day: "24h", week: "7d", month: "30d" }

const SOURCE_COLORS: Record<string, string> = {
  ssh: "hsl(250 60% 65%)",
  web: "hsl(199 89% 60%)",
  ftp: "hsl(48 96% 53%)",
  mysql: "hsl(270 60% 65%)",
  "port-scan": "hsl(217 91% 60%)",
  smb: "hsl(25 95% 60%)",
  mssql: "hsl(330 70% 65%)",
  mqtt: "hsl(174 72% 56%)",
  rpc: "hsl(239 68% 65%)",
  tftp: "hsl(84 80% 50%)",
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

export function CrossSensorActivityChart({ timeline: initialTimeline, range: initialRange }: Props) {
  const timezone = useTimezone()
  const t = useT()
  const [range, setRangeState]     = useState<TimeRange>(initialRange)
  const [timeline, setTimeline]    = useState<CrossSensorTimeline>(initialTimeline)
  const [loading, setLoading]      = useState(false)

  const changeRange = useCallback(async (next: TimeRange) => {
    if (next === range || loading) return
    setRangeState(next)
    setLoading(true)
    try {
      const qs = new URLSearchParams({ range: next, timezone }).toString()
      const res = await fetch(`/api/stats/cross-sensor-timeline?${qs}`)
      if (res.ok) setTimeline(await res.json())
    } catch {
      // keep current data on error
    } finally {
      setLoading(false)
    }
  }, [range, loading, timezone])

  const sources = ["ssh", "web", ...timeline.activeProtocols]
  const activeSources = sources.filter((source) =>
    timeline.buckets.some((bucket) => (bucket[source] as number) > 0),
  )

  const chartConfig = Object.fromEntries(
    activeSources.map((source) => [source, { label: source.toUpperCase(), color: colorFor(source) }]),
  ) as ChartConfig

  const xInterval = range === "day" ? 3 : range === "week" ? 0 : 4

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">{t("dash.activity.title")}</h3>
          <p className="text-sm text-muted-foreground">
            {range === "day" ? t("dash.activity.subtitleHour") : t("dash.activity.subtitleDay")}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(["day", "week", "month"] as TimeRange[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => changeRange(option)}
              disabled={loading}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                range === option
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              } disabled:opacity-50`}
            >
              {RANGE_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <div className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
        <ChartContainer config={chartConfig} className="aspect-auto h-[420px]">
          <AreaChart data={timeline.buckets as Record<string, unknown>[]}>
            <defs>
              {activeSources.map((source) => (
                <linearGradient key={source} id={gradId(source)} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colorFor(source)} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={colorFor(source)} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis axisLine={false} tickLine={false} width={35} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {activeSources.map((source) => (
              <Area
                key={source}
                type="monotone"
                dataKey={source}
                stroke={colorFor(source)}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#${gradId(source)})`}
                stackId="all"
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  )
}
