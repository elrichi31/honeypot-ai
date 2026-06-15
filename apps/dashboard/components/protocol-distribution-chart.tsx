"use client"

import { Bar, BarChart, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts"
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

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString("en-US")
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: { label: string; pct: number } }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const { value, payload: p } = payload[0]
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">{p.label}</p>
      <p className="text-muted-foreground">{value.toLocaleString("en-US")} events · {p.pct}%</p>
    </div>
  )
}

function CustomYTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const label = payload?.value ?? ""
  const color = colorFor(label)
  return (
    <g transform={`translate(${x},${y})`}>
      <circle cx={-10} cy={0} r={4} fill={color} />
      <text x={-18} y={0} dy="0.35em" textAnchor="end" fill="#94a3b8" fontSize={11} fontFamily="inherit">
        {label}
      </text>
    </g>
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

  const chartHeight = Math.max(220, data.length * 38)

  return (
    <Surface padded>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-foreground">Event distribution</h3>
          <p className="text-sm text-muted-foreground">By sensor type · cumulative total</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-foreground leading-none">{fmt(total)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">total events</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 56, bottom: 0, left: 72 }}
          barCategoryGap="28%"
        >
          <XAxis
            type="number"
            tickFormatter={fmt}
            tick={{ fontSize: 10, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={72}
            tick={(props) => <CustomYTick {...props} />}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={colorFor(entry.label)} />
            ))}
            <LabelList
              dataKey="pct"
              position="right"
              formatter={(v: number) => `${v}%`}
              style={{ fontSize: 10, fill: "#64748b" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Surface>
  )
}
