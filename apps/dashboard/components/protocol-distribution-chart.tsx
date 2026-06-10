"use client"

import { Cell, Pie, PieChart, Tooltip, ResponsiveContainer, Legend } from "recharts"
import type { HoneypotOverview } from "@/lib/api"
import { Surface } from "@/components/ui/surface"

const SOURCE_COLORS: Record<string, string> = {
  SSH:         "#8b5cf6",
  HTTP:        "#38bdf8",
  FTP:         "#facc15",
  MySQL:       "#a78bfa",
  "Port Scan": "#3b82f6",
  SMB:         "#f97316",
  MSSQL:       "#ec4899",
  MQTT:        "#14b8a6",
  RPC:         "#6366f1",
  TFTP:        "#84cc16",
}

function colorFor(label: string) {
  return SOURCE_COLORS[label] ?? "#64748b"
}

const PROTOCOL_LABEL: Record<string, string> = {
  ftp: "FTP", mysql: "MySQL", "port-scan": "Port Scan",
  smb: "SMB", mssql: "MSSQL", mqtt: "MQTT", rpc: "RPC", tftp: "TFTP",
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { pct: number } }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const { name, value, payload: p } = payload[0]
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">{name}</p>
      <p className="text-muted-foreground">{value.toLocaleString("en-US")} eventos</p>
      <p className="text-muted-foreground">{p.pct}% del total</p>
    </div>
  )
}

export function ProtocolDistributionChart({ overview }: { overview: HoneypotOverview }) {
  const raw: { label: string; value: number }[] = []

  if (overview.ssh.sessions > 0)
    raw.push({ label: "SSH", value: overview.ssh.sessions })
  if (overview.web.hits > 0)
    raw.push({ label: "HTTP", value: overview.web.hits })
  for (const p of overview.protocols) {
    if (p.count > 0)
      raw.push({ label: PROTOCOL_LABEL[p.protocol] ?? p.protocol.toUpperCase(), value: p.count })
  }

  const total = raw.reduce((s, r) => s + r.value, 0)
  if (total === 0) return null

  const data = raw
    .map((r) => ({ ...r, pct: Number(((r.value / total) * 100).toFixed(1)) }))
    .sort((a, b) => b.value - a.value)

  return (
    <Surface padded>
      <div className="mb-2">
        <h3 className="font-semibold text-foreground">Event distribution</h3>
        <p className="text-sm text-muted-foreground">By sensor type · cumulative total</p>
      </div>

      <div className="relative flex items-center justify-center">
        <ResponsiveContainer width="100%" height={380}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell key={entry.label} fill={colorFor(entry.label)} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span className="text-xs text-muted-foreground">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Total in center */}
        <div className="pointer-events-none absolute flex flex-col items-center justify-center">
          <p className="text-xl font-bold text-foreground leading-none">
            {total >= 1_000_000
              ? `${(total / 1_000_000).toFixed(1)}M`
              : total >= 1_000
              ? `${(total / 1_000).toFixed(1)}k`
              : total.toLocaleString("en-US")}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">events</p>
        </div>
      </div>
    </Surface>
  )
}
