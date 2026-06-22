"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Activity } from "lucide-react"
import { useLiveStream, type AttackStreamEvent } from "@/hooks/use-live-stream"

const WINDOW_MS = 60_000

interface TypeCount { [type: string]: number }

// Footer widget: shows attack breakdown by type in the last 60 s.
// Hidden when idle so it only draws attention when there's real activity.
export function LiveAttackWidget() {
  const [counts, setCounts] = useState<TypeCount>({})
  const entries = useRef<{ ts: number; type: string }[]>([])

  const prune = useCallback(() => {
    const cutoff = Date.now() - WINDOW_MS
    entries.current = entries.current.filter((e) => e.ts > cutoff)
    const next: TypeCount = {}
    for (const e of entries.current) next[e.type] = (next[e.type] ?? 0) + 1
    setCounts(next)
  }, [])

  useLiveStream({
    onAttack: useCallback((event: AttackStreamEvent) => {
      entries.current.push({ ts: Date.now(), type: event.type })
      prune()
    }, [prune]),
  })

  useEffect(() => {
    const id = setInterval(prune, 5_000)
    return () => clearInterval(id)
  }, [prune])

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const summary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${type.toUpperCase()} ${n}`)
    .join(" · ")

  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-foreground leading-none mb-0.5">
          {total} attack{total !== 1 ? "s" : ""} · last 60s
        </p>
        <p className="text-[10px] text-muted-foreground truncate">{summary}</p>
      </div>
      <Activity className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
    </div>
  )
}
