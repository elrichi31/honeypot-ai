"use client"

import { Layers3 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import type { DashboardInsights } from "@/lib/api"

const DEPTH_BUCKET_ORDER = ["0", "1-3", "4-10", "11-20", "21+"]
const chartConfig = { sessions: { label: "Sessions", color: "#f59e0b" } } satisfies ChartConfig

type Props = { successfulDepth: DashboardInsights["successfulDepth"] }

export function SessionDepthChart({ successfulDepth }: Props) {
  const depthBuckets = DEPTH_BUCKET_ORDER.map((bucket) => ({
    bucket,
    sessions: successfulDepth.buckets.find((e) => e.bucket === bucket)?.sessions ?? 0,
  }))

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-5 flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-amber-400" />
        <div>
          <h2 className="font-semibold text-foreground">Successful Session Depth</h2>
          <p className="text-sm text-muted-foreground">
            Most successful logins stay extremely shallow, which is useful signal on its own
          </p>
        </div>
      </div>

      <div className="mb-5">
        <ChartContainer config={chartConfig} className="aspect-auto h-[240px]">
          <BarChart data={depthBuckets} margin={{ top: 24, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="bucket" axisLine={false} tickLine={false} />
            <YAxis axisLine={false} tickLine={false} width={36} />
            <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="sessions" radius={[8, 8, 0, 0]} fill="var(--color-sessions)">
              <LabelList dataKey="sessions" position="top" style={{ fontSize: 11, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">Average commands</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{successfulDepth.averageCommands}</p>
        </div>
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">Maximum depth</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{successfulDepth.maxCommands}</p>
        </div>
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">20+ commands</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{successfulDepth.interactiveSessions}</p>
        </div>
      </div>
    </section>
  )
}
