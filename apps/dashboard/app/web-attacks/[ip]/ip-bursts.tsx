"use client"

import { format } from "date-fns"
import { Zap } from "lucide-react"
import { ATTACK_COLORS, ATTACK_LABELS } from "@/lib/attack-types"
import type { WebHit } from "@/lib/api"

const GAP_MS = 15 * 60 * 1000

interface Burst {
  startedAt: string
  endedAt: string
  hits: number
  intensityPerMin: number
  attackTypes: string[]
  canary: boolean
}

/** Format a duration in seconds as a compact "Xh Ym" / "Ym Zs" / "Zs". */
function fmtDuration(sec: number): string {
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
  if (sec >= 60) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${sec}s`
}

/**
 * Groups one attacker's hits into time bursts (runs with no gap > 15 min),
 * client-side from the already-loaded hits. A 1000-hit scan in 10 minutes shows
 * as one row with its intensity, so it stops drowning the per-request timeline.
 */
export function IpBursts({ hits }: { hits: WebHit[] }) {
  const sorted = [...hits].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const bursts: Burst[] = []
  let current: { hits: WebHit[]; start: number; end: number } | null = null
  for (const hit of sorted) {
    const t = new Date(hit.timestamp).getTime()
    if (current && t - current.end <= GAP_MS) {
      current.hits.push(hit)
      current.end = t
    } else {
      if (current) bursts.push(toBurst(current))
      current = { hits: [hit], start: t, end: t }
    }
  }
  if (current) bursts.push(toBurst(current))
  bursts.reverse() // newest first

  if (bursts.length <= 1) return null // nothing gained from grouping a single burst

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-warning" />
          <h3 className="font-semibold text-foreground">Attack bursts</h3>
        </div>
        <p className="text-xs text-muted-foreground">{bursts.length} separate campaigns · 15-min gap</p>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-border">
        {bursts.map((b, i) => (
          <div key={i} className="px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-foreground">
                {format(new Date(b.startedAt), "dd/MM HH:mm")}
                <span className="text-muted-foreground"> · {fmtDuration(Math.round((new Date(b.endedAt).getTime() - new Date(b.startedAt).getTime()) / 1000))}</span>
              </span>
              <span className="font-mono text-xs font-semibold text-foreground">
                {b.hits.toLocaleString("en-US")} hits
                <span className="ml-1 text-warning">{b.intensityPerMin}/min</span>
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {b.canary && (
                <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/15 px-1.5 py-0 text-[10px] font-semibold text-red-400">
                  🎯 Canary
                </span>
              )}
              {b.attackTypes.map((t) => (
                <span
                  key={t}
                  className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${ATTACK_COLORS[t] ?? ATTACK_COLORS.recon}`}
                >
                  {ATTACK_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function toBurst(group: { hits: WebHit[]; start: number; end: number }): Burst {
  const durationMin = (group.end - group.start) / 60000
  const intensity = durationMin > 0 ? group.hits.length / durationMin : group.hits.length
  return {
    startedAt: new Date(group.start).toISOString(),
    endedAt: new Date(group.end).toISOString(),
    hits: group.hits.length,
    intensityPerMin: Math.round(intensity * 10) / 10,
    attackTypes: [...new Set(group.hits.map((h) => h.attackType))],
    canary: group.hits.some((h) => h.canaryTriggered),
  }
}
