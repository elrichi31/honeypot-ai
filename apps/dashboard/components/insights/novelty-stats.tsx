"use client"

import { Sparkles } from "lucide-react"
import { Surface } from "@/components/ui/surface"
import type { NoveltyStats } from "@/lib/api"

type Props = { novelty: NoveltyStats }

function StatRow({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${accent && value > 0 ? "text-amber-400" : "text-foreground"}`}>
        {value.toLocaleString("en-US")}
      </span>
    </div>
  )
}

export function NoveltyStatsView({ novelty }: Props) {
  const { windowHours, newIps, newCredPairs, newWebPaths, newCommands, topNewIps } = novelty

  return (
    <Surface className="p-5">
      <div className="mb-5 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-400" />
        <div>
          <h2 className="font-semibold text-foreground">First Seen / Novelty</h2>
          <p className="text-sm text-muted-foreground">
            New activity in the last {windowHours}h — never seen before this window
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Novelty counters */}
        <div>
          <StatRow label="New source IPs"          value={newIps}       accent />
          <StatRow label="New credential pairs"    value={newCredPairs} accent />
          <StatRow label="New web paths probed"    value={newWebPaths}  accent />
          <StatRow label="New SSH commands"        value={newCommands}  accent />
        </div>

        {/* Top new IPs */}
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Top new IPs by activity
          </p>
          {topNewIps.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No new IPs in window</p>
          ) : (
            <div className="space-y-2">
              {topNewIps.map((entry) => {
                const pct = Math.max(5, (entry.hits / (topNewIps[0]?.hits || 1)) * 100)
                return (
                  <div key={entry.srcIp} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-foreground truncate">{entry.srcIp}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {entry.hits.toLocaleString("en-US")}
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-border/40">
                      <div
                        className="h-1 rounded-full bg-amber-400/80"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Surface>
  )
}
