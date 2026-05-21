"use client"

import { useEffect, useState } from "react"
import { ShieldAlert, Globe, Zap, Bug } from "lucide-react"

type Summary = {
  totalToday: number
  byType: { type: string; count: number }[]
  topIps: { ip: string; count: number }[]
}

const TYPE_LABELS: Record<string, string> = {
  scanner:     "Scanner",
  path_probe:  "Path Probe",
  injection:   "Injection",
  brute_force: "Brute Force",
}

export function DefenseStats() {
  const [data, setData] = useState<Summary | null>(null)

  useEffect(() => {
    fetch("/api/defense/summary")
      .then(r => r.ok ? r.json() : null)
      .then((d: unknown) => { if (d && typeof d === "object") setData(d as Summary) })
      .catch(() => {})
  }, [])

  const topType  = data?.byType[0]
  const topIp    = data?.topIps[0]
  const uniqueIps = data ? new Set(data.topIps.map(i => i.ip)).size : null

  const metrics = [
    { icon: ShieldAlert, label: "Attacks today",  value: data ? data.totalToday.toLocaleString() : "—", color: data?.totalToday ? "text-red-400" : "text-emerald-400", bg: data?.totalToday ? "bg-red-400/10" : "bg-emerald-400/10" },
    { icon: Globe,       label: "Unique IPs",      value: data ? (data.topIps.length >= 10 ? "10+" : String(data.topIps.length)) : "—", color: "text-blue-400",   bg: "bg-blue-400/10" },
    { icon: Bug,         label: "Top attack type", value: topType ? (TYPE_LABELS[topType.type] ?? topType.type) : "—", color: "text-orange-400", bg: "bg-orange-400/10" },
    { icon: Zap,         label: "Top attacker",    value: topIp ? topIp.ip : "—", color: "text-purple-400", bg: "bg-purple-400/10" },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {metrics.map(({ icon: Icon, label, value, color, bg }) => (
        <div key={label} className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div className="min-w-0">
            <p className={`text-lg font-semibold tabular-nums leading-tight truncate ${color}`}>{value}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
