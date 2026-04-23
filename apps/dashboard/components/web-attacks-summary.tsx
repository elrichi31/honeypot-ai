"use client"

import Link from "next/link"
import { Globe, ArrowRight } from "lucide-react"
import { Bar, BarChart, Cell, XAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { ATTACK_COLORS_HEX as ATTACK_COLORS, ATTACK_LABELS } from "@/lib/attack-types"

const chartConfig = {
  count: { label: "Hits" },
} satisfies ChartConfig

interface Props {
  total:        number
  uniqueIps:    number
  byAttackType: { attackType: string; count: number }[]
  topIps:       { srcIp: string; count: number }[]
}

export function WebAttacksSummary({ total, uniqueIps, byAttackType, topIps }: Props) {
  const chartData = byAttackType.map((a) => ({
    name:  ATTACK_LABELS[a.attackType] ?? a.attackType,
    count: a.count,
    fill:  ATTACK_COLORS[a.attackType] ?? "#6b7280",
  }))

  const topThreat = byAttackType[0]

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
            <Globe className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Web Attacks</h3>
            <p className="text-xs text-muted-foreground">HTTP honeypot · port 80</p>
          </div>
        </div>
        <Link
          href="/web-attacks"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Ver detalle <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Total hits</p>
          <p className="mt-0.5 text-xl font-semibold text-foreground">{total.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Atacantes</p>
          <p className="mt-0.5 text-xl font-semibold text-foreground">{uniqueIps}</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Top amenaza</p>
          <p className="mt-0.5 text-sm font-semibold" style={{ color: ATTACK_COLORS[topThreat?.attackType ?? "recon"] ?? "#6b7280" }}>
            {ATTACK_LABELS[topThreat?.attackType ?? ""] ?? "—"}
          </p>
        </div>
      </div>

      <ChartContainer config={chartConfig} className="aspect-auto h-[120px]">
        <BarChart data={chartData} barSize={20}>
          <XAxis dataKey="name" axisLine={false} tickLine={false} />
          <ChartTooltip
            content={<ChartTooltipContent hideLabel />}
            cursor={{ fill: "hsl(var(--muted)/0.4)" }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>

      {topIps.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">Top IPs atacantes</p>
          {topIps.slice(0, 4).map((ip) => (
            <div key={ip.srcIp} className="flex items-center justify-between">
              <Link
                href={`/web-attacks/${encodeURIComponent(ip.srcIp)}`}
                className="font-mono text-xs text-foreground hover:text-blue-400 transition-colors"
              >
                {ip.srcIp}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">{ip.count} hits</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
