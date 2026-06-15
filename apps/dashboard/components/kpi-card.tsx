"use client"

import { TrendingUp, TrendingDown } from "lucide-react"
import { Line, LineChart, YAxis } from "recharts"
import { Surface } from "@/components/ui/surface"
import { ChartContainer } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { useT } from "@/components/locale-provider"

interface Props {
  label: string
  value: number
  detail: string
  deltaPct: number | null
  spark: number[]
}

const sparkConfig = { v: { label: "", color: "#22d3ee" } } satisfies ChartConfig

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  const t = useT()
  if (deltaPct === null) return null
  const up = deltaPct >= 0
  const Icon = up ? TrendingUp : TrendingDown
  const tone = up ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${tone}`}
      title={t("dash.kpi.vsPrev24h")}
    >
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}{deltaPct}%
    </span>
  )
}

export function KpiCard({ label, value, detail, deltaPct, spark }: Props) {
  const data = spark.map((v, i) => ({ i, v }))

  return (
    <Surface padded>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        <DeltaBadge deltaPct={deltaPct} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold text-foreground">{value.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        {data.length > 1 && (
          <ChartContainer config={sparkConfig} className="h-10 w-24 shrink-0">
            <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Line
                dataKey="v"
                type="monotone"
                stroke="var(--color-v)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </div>
    </Surface>
  )
}
