"use client"

import { useEffect, useState } from "react"
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

type Range = "day" | "week" | "month"

type Bucket = {
  bucket: string
  ssh: number
  protocol: number
  web: number
  total: number
}

const chartConfig = {
  ssh:      { label: "SSH",      color: "hsl(190 80% 50%)" },
  protocol: { label: "Protocol", color: "hsl(220 70% 60%)" },
  web:      { label: "Web",      color: "hsl(145 60% 50%)" },
} satisfies ChartConfig

const RANGE_LABELS: Record<Range, string> = { day: "24h", week: "7d", month: "30d" }

function formatBucketLabel(bucket: string, range: Range) {
  const d = new Date(bucket)
  if (range === "month") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

type Props = { clientSlug: string }

export function ClientActivityChart({ clientSlug }: Props) {
  const [range, setRange] = useState<Range>("week")
  const [data, setData]   = useState<Bucket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/clients/${clientSlug}/timeline?range=${range}`)
      .then(r => r.json())
      .then((rows: unknown) => {
        const arr = Array.isArray(rows) ? rows : []
        setData(arr.map((r: Bucket) => ({
          ...r,
          label: formatBucketLabel(r.bucket, range),
        })))
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [clientSlug, range])

  const xInterval = range === "month" ? 3 : range === "week" ? 6 : 3
  const totalEvents = data.reduce((s, b) => s + b.total, 0)

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
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
      ) : data.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
          No events recorded yet
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="aspect-auto h-[200px]">
          <AreaChart data={data}>
            <defs>
              {(["ssh", "protocol", "web"] as const).map(key => (
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
            {(["ssh", "protocol", "web"] as const).map(key => (
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
    </div>
  )
}
