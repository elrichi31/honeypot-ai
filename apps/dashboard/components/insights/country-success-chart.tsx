"use client"

import { Globe2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts"
import type { TooltipProps } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { useT } from "@/components/locale-provider"

export interface CountrySuccessRow {
  country: string
  countryName: string
  sessions: number
  successes: number
  uniqueIps: number
  successRate: number
}

function countryFlag(code: string) {
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

function CountryRateTooltip({ active, payload }: TooltipProps<number, string>) {
  const t = useT()
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as CountrySuccessRow | undefined
  if (!row) return null
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-2xl">
      <p className="text-sm font-medium text-foreground">
        {countryFlag(row.country)} {row.countryName}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t("dash.country.sessionsIps", { sessions: row.sessions, ips: row.uniqueIps })}</p>
      <p className="mt-2 text-sm font-semibold text-emerald-400">{t("dash.country.success", { rate: row.successRate })}</p>
    </div>
  )
}

type Props = { rows: CountrySuccessRow[] }

export function CountrySuccessChart({ rows }: Props) {
  const t = useT()
  const chartConfig = { successRate: { label: t("dash.country.successRate") } } satisfies ChartConfig
  const data = rows.map((row) => ({ ...row, yLabel: `${countryFlag(row.country)} ${row.countryName}` }))
  const height = Math.max(360, data.length * 52)

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-5 flex items-center gap-2">
        <Globe2 className="h-4 w-4 text-emerald-400" />
        <div>
          <h2 className="font-semibold text-foreground">{t("dash.country.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("dash.country.subtitle")}
          </p>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-sm bg-emerald-500" />{t("dash.country.top3")}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-sm bg-sky-400" />{t("dash.country.midTier")}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-sm bg-amber-400" />{t("dash.country.rest")}</span>
      </div>

      <ChartContainer config={chartConfig} className="aspect-auto" style={{ height: `${height}px` }}>
        <BarChart data={data} layout="vertical" barCategoryGap={8} margin={{ left: 8, right: 52, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="countryName" axisLine={false} tickLine={false} width={140} />
          <ChartTooltip content={<CountryRateTooltip />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
          <Bar dataKey="successRate" radius={[0, 6, 6, 0]} barSize={26}>
            <LabelList dataKey="successRate" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 11 }} />
            {data.map((row, index) => (
              <Cell key={row.country} fill={index < 3 ? "#22c55e" : index < 7 ? "#38bdf8" : "#f59e0b"} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </section>
  )
}
