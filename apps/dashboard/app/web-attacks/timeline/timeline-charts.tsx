"use client"

import { Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { ATTACK_COLORS_HEX as ATTACK_COLORS, ATTACK_LABELS_LONG as ATTACK_LABELS } from "@/lib/attack-types"

const timelineChartConfig: ChartConfig = Object.fromEntries(
  Object.entries(ATTACK_COLORS).map(([key, color]) => [
    key,
    { label: ATTACK_LABELS[key] ?? key, color },
  ])
)

interface Props {
  days: ({ day: string } & Record<string, number>)[]
  attackTypes: string[]
  byAttackType: { attackType: string; count: number }[]
}

export function TimelineCharts({ days, attackTypes, byAttackType }: Props) {
  const pieData = byAttackType.map((a) => ({
    name:  a.attackType,
    value: a.count,
    fill:  ATTACK_COLORS[a.attackType] ?? "#6b7280",
  }))

  return (
    <div className="space-y-6">
      {/* Stacked bar — hits por día */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-1 font-semibold text-foreground">Hits por día</h3>
        <p className="mb-4 text-xs text-muted-foreground">Últimos 30 días · apilado por tipo de ataque</p>
        {days.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin datos aún</p>
        ) : (
          <ChartContainer config={timelineChartConfig} className="aspect-auto h-[280px]">
            <BarChart data={days} barSize={14}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} interval={4} />
              <YAxis axisLine={false} tickLine={false} width={28} />
              <ChartTooltip
                content={<ChartTooltipContent />}
                cursor={{ fill: "hsl(var(--muted)/0.3)" }}
              />
              <ChartLegend content={<ChartLegendContent />} />
              {attackTypes.map((t) => (
                <Bar
                  key={t}
                  dataKey={t}
                  stackId="a"
                  fill={ATTACK_COLORS[t] ?? "#6b7280"}
                  radius={attackTypes.indexOf(t) === attackTypes.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </div>

      {/* Dos columnas: Pie + tabla de totales */}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-1 font-semibold text-foreground">Distribución total</h3>
          <p className="mb-4 text-xs text-muted-foreground">Porcentaje por tipo de ataque · all-time</p>
          <ChartContainer config={timelineChartConfig} className="aspect-auto h-[260px]">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <ChartTooltip
                content={<ChartTooltipContent nameKey="name" />}
              />
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
            </PieChart>
          </ChartContainer>
        </div>

        {/* Ranking numérico */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-1 font-semibold text-foreground">Ranking de ataques</h3>
          <p className="mb-4 text-xs text-muted-foreground">Ordenado por frecuencia · all-time</p>
          <div className="space-y-3">
            {byAttackType.map((a, i) => {
              const total = byAttackType.reduce((s, x) => s + x.count, 0)
              const pct   = total > 0 ? Math.round((a.count / total) * 100) : 0
              const color = ATTACK_COLORS[a.attackType] ?? "#6b7280"
              return (
                <div key={a.attackType}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {i + 1}. {ATTACK_LABELS[a.attackType] ?? a.attackType}
                    </span>
                    <span className="text-muted-foreground">
                      {a.count.toLocaleString('en-US')} <span className="opacity-60">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
