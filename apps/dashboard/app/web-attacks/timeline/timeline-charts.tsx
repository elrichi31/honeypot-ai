"use client"

import {
  Bar, BarChart, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

const ATTACK_COLORS: Record<string, string> = {
  sqli:            "#ef4444",
  xss:             "#f97316",
  lfi:             "#eab308",
  rfi:             "#ca8a04",
  cmdi:            "#a855f7",
  scanner:         "#3b82f6",
  info_disclosure: "#06b6d4",
  recon:           "#6b7280",
}

const ATTACK_LABELS: Record<string, string> = {
  sqli:            "SQL Injection",
  xss:             "XSS",
  lfi:             "LFI",
  rfi:             "RFI",
  cmdi:            "Cmd Injection",
  scanner:         "Scanner",
  info_disclosure: "Info Disclosure",
  recon:           "Recon",
}

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(0 0% 12%)",
  border: "1px solid hsl(0 0% 22%)",
  borderRadius: "8px",
  fontSize: "12px",
}

interface Props {
  days: ({ day: string } & Record<string, number>)[]
  attackTypes: string[]
  byAttackType: { attackType: string; count: number }[]
}

export function TimelineCharts({ days, attackTypes, byAttackType }: Props) {
  const pieData = byAttackType.map((a) => ({
    name:  ATTACK_LABELS[a.attackType] ?? a.attackType,
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
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} barSize={14}>
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(0 0% 60%)", fontSize: 10 }}
                  interval={4}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(0 0% 60%)", fontSize: 10 }}
                  width={28}
                />
                <Tooltip
                  cursor={{ fill: "hsl(0 0% 18%)" }}
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "hsl(0 0% 95%)" }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }}
                  formatter={(value) => ATTACK_LABELS[value] ?? value}
                />
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
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Dos columnas: Pie + tabla de totales */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Pie chart distribución total */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-1 font-semibold text-foreground">Distribución total</h3>
          <p className="mb-4 text-xs text-muted-foreground">Porcentaje por tipo de ataque · all-time</p>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
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
                    <span className="text-muted-foreground">{a.count.toLocaleString()} <span className="opacity-60">({pct}%)</span></span>
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
