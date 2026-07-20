"use client"

import { BarChart2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { Surface } from "@/components/ui/surface"

const chartConfig = {
  hits: { label: "Hits", color: "#06b6d4" },
} satisfies ChartConfig

type Bucket = { label: string; count: number }

interface SessionActivityChartProps {
  buckets: Bucket[]
  className?: string
}

export function SessionActivityChart({ buckets, className }: SessionActivityChartProps) {
  const data = buckets.map((b) => ({ label: b.label, hits: b.count }))

  return (
    <Surface className={className}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-foreground">Activity over session</h3>
        <span className="ml-auto text-xs text-muted-foreground">{buckets.length} time buckets</span>
      </div>
      <ChartContainer config={chartConfig} className="aspect-auto h-[140px] w-full">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} interval={2} tick={{ fontSize: 10 }} />
          <YAxis hide />
          <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
          <Bar dataKey="hits" radius={[3, 3, 0, 0]} fill="var(--color-hits)" />
        </BarChart>
      </ChartContainer>
    </Surface>
  )
}
