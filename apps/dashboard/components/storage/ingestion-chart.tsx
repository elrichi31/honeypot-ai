"use client"

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts"

type DayEntry = { date: string; ssh: number; web: number; protocol: number; defense: number }

const SERIES = [
  { key: "ssh",      label: "SSH",      color: "#60a5fa" },
  { key: "web",      label: "Web",      color: "#34d399" },
  { key: "protocol", label: "Protocol", color: "#f59e0b" },
  { key: "defense",  label: "Defense",  color: "#f87171" },
] as const

function shortDate(iso: string) {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + p.value, 0)
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="tabular-nums text-foreground">{p.value.toLocaleString()}</span>
        </div>
      ))}
      <div className="mt-1 border-t border-border/50 pt-1 font-medium text-foreground">
        Total: {total.toLocaleString()}
      </div>
    </div>
  )
}

export function IngestionChart({ data }: { data: DayEntry[] }) {
  const display = data.map(d => ({ ...d, date: shortDate(d.date) }))

  return (
    <div className="rounded-xl border border-border bg-card px-4 pt-4 pb-2">
      <p className="text-sm font-semibold text-foreground mb-1">Daily Ingestion</p>
      <p className="text-[11px] text-muted-foreground mb-4">Events ingested per day — last 14 days</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={display}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
          <Legend
            iconType="circle" iconSize={6}
            formatter={(v) => <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{v}</span>}
          />
          {SERIES.map(s => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
