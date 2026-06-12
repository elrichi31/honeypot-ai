"use client"

import { Bot } from "lucide-react"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import { Surface } from "@/components/ui/surface"
import type { BotRatio } from "@/lib/api"

type Props = { ratio: BotRatio }

const SLICE_COLORS = { bot: "#f87171", human: "#34d399", unknown: "#94a3b8" }
const SLICE_LABELS = { bot: "Bot", human: "Human", unknown: "Unknown" }

function PctBar({ label, count, pct, color }: { label: string; count: number; pct: number | null; color: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-1 items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-muted/30 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, backgroundColor: color }} />
        </div>
        <span className="w-10 text-right text-xs tabular-nums text-foreground font-medium">
          {pct !== null ? `${pct}%` : "—"}
        </span>
      </div>
      <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
        {count.toLocaleString("en-US")}
      </span>
    </div>
  )
}

export function BotRatioView({ ratio }: Props) {
  const { bot, human, unknown, total, botPct, humanPct, unknownPct } = ratio

  const slices = [
    { name: SLICE_LABELS.bot,     value: bot,     pct: botPct,     color: SLICE_COLORS.bot },
    { name: SLICE_LABELS.human,   value: human,   pct: humanPct,   color: SLICE_COLORS.human },
    { name: SLICE_LABELS.unknown, value: unknown, pct: unknownPct, color: SLICE_COLORS.unknown },
  ].filter((s) => s.value > 0)

  return (
    <Surface className="p-5">
      <div className="mb-5 flex items-center gap-2">
        <Bot className="h-4 w-4 text-rose-400" />
        <div>
          <h2 className="font-semibold text-foreground">Bot vs Human</h2>
          <p className="text-sm text-muted-foreground">
            SSH session actor classification · {total.toLocaleString("en-US")} sessions (90d)
          </p>
        </div>
      </div>

      {total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No sessions in window</p>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          {/* Donut */}
          <div className="h-[140px] w-[140px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  innerRadius="60%"
                  outerRadius="85%"
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                  strokeWidth={0}
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => [value.toLocaleString("en-US"), name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Bars */}
          <div className="flex-1 w-full">
            <PctBar label="Bot"     count={bot}     pct={botPct}     color={SLICE_COLORS.bot} />
            <PctBar label="Human"   count={human}   pct={humanPct}   color={SLICE_COLORS.human} />
            <PctBar label="Unknown" count={unknown} pct={unknownPct} color={SLICE_COLORS.unknown} />
          </div>
        </div>
      )}
    </Surface>
  )
}
