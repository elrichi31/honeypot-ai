"use client"

import { Database } from "lucide-react"
import { Surface } from "@/components/ui/surface"

type RedisStats = {
  connected: boolean
  version?: string | null
  uptimeSeconds?: number
  memoryUsedBytes?: number
  memoryPeakBytes?: number
  hitRate?: number | null
  opsPerSec?: number
  connectedClients?: number
  totalCommands?: number
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[12px] text-foreground">{value}</span>
    </div>
  )
}

export function RedisCard({ redis }: { redis: RedisStats }) {
  if (!redis.connected) {
    return (
      <Surface className="px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-red-400" />
          <span className="text-sm font-medium text-muted-foreground">Redis Cache</span>
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-red-400/10 text-red-400">offline</span>
        </div>
        <p className="text-[11px] text-muted-foreground">Cache not connected.</p>
      </Surface>
    )
  }

  const memPct = redis.memoryPeakBytes && redis.memoryPeakBytes > 0
    ? Math.round((redis.memoryUsedBytes! / redis.memoryPeakBytes) * 100)
    : 0

  return (
    <Surface className="px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <Database className="h-4 w-4 text-red-400" />
        <span className="text-sm font-medium">Redis Cache</span>
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400">online</span>
        {redis.version && <span className="text-[10px] text-muted-foreground/60">v{redis.version}</span>}
      </div>

      {/* Memory bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-muted-foreground">Memory used</span>
          <span className="font-mono text-red-400">{fmt(redis.memoryUsedBytes ?? 0)}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-red-400/70" style={{ width: `${memPct}%` }} />
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">Peak: {fmt(redis.memoryPeakBytes ?? 0)}</p>
      </div>

      <div className="divide-y divide-border/40">
        <Stat label="Hit rate" value={redis.hitRate != null ? `${redis.hitRate}%` : "—"} />
        <Stat label="Ops/sec" value={String(redis.opsPerSec ?? 0)} />
        <Stat label="Clients" value={String(redis.connectedClients ?? 0)} />
        <Stat label="Total commands" value={(redis.totalCommands ?? 0).toLocaleString()} />
        {redis.uptimeSeconds != null && (
          <Stat label="Uptime" value={formatUptime(redis.uptimeSeconds)} />
        )}
      </div>
    </Surface>
  )
}
