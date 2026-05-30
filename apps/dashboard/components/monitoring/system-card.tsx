"use client"

import { Cpu, MemoryStick } from "lucide-react"

type MemoryStats = {
  totalKb: number
  availableKb: number
  usedKb: number
  usedPercent: number
}

type SystemStats = {
  uptime: number
  loadAvg: [number, number, number]
  memory: MemoryStats
}

function fmt(kb: number): string {
  if (kb === 0) return "0 B"
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(0)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function UsageBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-white/[0.06]">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

export function SystemCard({ system }: { system: SystemStats }) {
  const memColor = system.memory.usedPercent > 85 ? "bg-red-400" : system.memory.usedPercent > 65 ? "bg-yellow-400" : "bg-emerald-400"
  const load1 = system.loadAvg[0]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* RAM */}
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <MemoryStick className="h-4 w-4 text-emerald-400" />
            <span className="text-[11px] text-muted-foreground">RAM Usage</span>
          </div>
          <p className="text-xl font-semibold tabular-nums text-emerald-400">{fmt(system.memory.usedKb)}</p>
          <p className="text-[11px] text-muted-foreground">{system.memory.usedPercent}% of {fmt(system.memory.totalKb)}</p>
          <UsageBar pct={system.memory.usedPercent} color={memColor} />
        </div>

        {/* Load average */}
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="h-4 w-4 text-blue-400" />
            <span className="text-[11px] text-muted-foreground">Load Average</span>
          </div>
          <p className="text-xl font-semibold tabular-nums text-blue-400">{load1.toFixed(2)}</p>
          <p className="text-[11px] text-muted-foreground">1m · 5m: {system.loadAvg[1].toFixed(2)} · 15m: {system.loadAvg[2].toFixed(2)}</p>
          <UsageBar pct={(load1 / 4) * 100} color={load1 > 4 ? "bg-red-400" : load1 > 2 ? "bg-yellow-400" : "bg-blue-400"} />
        </div>

        {/* Uptime */}
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-muted-foreground">Server Uptime</span>
          </div>
          <p className="text-xl font-semibold tabular-nums text-foreground">{formatUptime(system.uptime)}</p>
          <p className="text-[11px] text-muted-foreground">{system.uptime.toLocaleString()} seconds</p>
        </div>
      </div>
    </div>
  )
}
