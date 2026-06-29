"use client"

import { useEffect, useState } from "react"
import { Activity, Globe, ShieldAlert, Zap } from "lucide-react"
import { Surface } from "@/components/ui/surface"
import { useT } from "@/components/locale-provider"

type Stats = {
  totalEvents: number
  uniqueIps: number
  loginSuccesses: number
  topProtocol: string | null
}

type Props = { clientSlug: string }

export function ClientStatsBar({ clientSlug }: Props) {
  const t = useT()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/clients/${clientSlug}/today`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then((d: unknown) => {
        if (d && typeof d === "object") setStats(d as Stats)
      })
      .catch((err) => { if (err?.name === "AbortError") return })
    return () => controller.abort()
  }, [clientSlug])

  const items = [
    {
      icon: Activity,
      label: t("clients.stats.eventsToday"),
      value: stats ? stats.totalEvents.toLocaleString() : "—",
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
    },
    {
      icon: Globe,
      label: t("clients.stats.uniqueIps"),
      value: stats ? stats.uniqueIps.toLocaleString() : "—",
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      icon: ShieldAlert,
      label: t("clients.stats.loginSuccesses"),
      value: stats ? stats.loginSuccesses.toLocaleString() : "—",
      color: stats?.loginSuccesses ? "text-red-400" : "text-emerald-400",
      bg: stats?.loginSuccesses ? "bg-red-400/10" : "bg-emerald-400/10",
    },
    {
      icon: Zap,
      label: t("clients.stats.topProtocol"),
      value: stats?.topProtocol ? stats.topProtocol.toUpperCase() : "—",
      color: "text-orange-400",
      bg: "bg-orange-400/10",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ icon: Icon, label, value, color, bg }) => (
        <Surface key={label} className="px-4 py-3 flex items-center gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div>
            <p className={`text-lg font-semibold tabular-nums leading-tight ${color}`}>{value}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        </Surface>
      ))}
    </div>
  )
}
