"use client"

import { useEffect, useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Activity } from "lucide-react"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { Surface } from "@/components/ui/surface"

type Range = "day" | "week" | "month"

// One row per bucket, with a dynamic per-protocol count keyed by protocol name.
type Bucket = { bucket: string; total: number; [protocol: string]: number | string }
type TimelineResponse = { protocols: string[]; buckets: Bucket[] }

const RANGE_LABELS: Record<Range, string> = { day: "24h", week: "7d", month: "30d" }

// Evenly-spaced hues so any number of dynamic protocols gets a distinct, stable color.
function protocolColor(index: number, total: number) {
  const hue = Math.round((index * 360) / Math.max(total, 1))
  return `hsl(${hue} 70% 55%)`
}

// Build a chart config from the protocols the client actually has in this window.
function buildChartConfig(protocols: string[]): ChartConfig {
  return Object.fromEntries(
    protocols.map((p, i) => [p, { label: p.toUpperCase(), color: protocolColor(i, protocols.length) }]),
  )
}

function formatBucketLabel(bucket: string, range: Range) {
  const d = new Date(bucket)
  if (range === "month") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }
  if (range === "week") {
    // 7d is bucketed hourly; show date + hour so the axis tracks days, not a
    // 24h clock that silently repeats every day.
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" })
  }
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

type Props = { clientSlug: string }

export function ClientActivityChart({ clientSlug }: Props) {
  const [range, setRange] = useState<Range>("week")
  const [protocols, setProtocols] = useState<string[]>([])
  const [data, setData]   = useState<Bucket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/clients/${clientSlug}/timeline?range=${range}`)
      .then(r => r.json())
      .then((res: TimelineResponse) => {
        const buckets = Array.isArray(res?.buckets) ? res.buckets : []
        setProtocols(Array.isArray(res?.protocols) ? res.protocols : [])
        setData(buckets.map(b => ({ ...b, label: formatBucketLabel(b.bucket, range) })))
      })
      .catch(() => { setProtocols([]); setData([]) })
      .finally(() => setLoading(false))
  }, [clientSlug, range])

  const chartConfig = useMemo(() => buildChartConfig(protocols), [protocols])
  const xInterval = range === "month" ? 3 : range === "week" ? 6 : 3
  const totalEvents = data.reduce((s, b) => s + b.total, 0)

  return (
    <Surface className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10">
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Activity</h2>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading…" : `${totalEvents.toLocaleString()} events`}
            </p>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(["day", "week", "month"] as Range[]).map(r => (
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

      {loading ? (
        <div className="h-[200px] flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-cyan-400" />
        </div>
      ) : data.length === 0 || protocols.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
          No events recorded yet
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="aspect-auto h-[200px]">
          <AreaChart data={data}>
            <defs>
              {protocols.map(key => (
                <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={`var(--color-${key})`} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} interval={xInterval} tick={{ fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} width={30} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {protocols.map(key => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#grad-${key})`}
                stackId="1"
              />
            ))}
          </AreaChart>
        </ChartContainer>
      )}
    </Surface>
  )
}
