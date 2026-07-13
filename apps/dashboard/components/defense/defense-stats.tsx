"use client"

import { useEffect, useState } from "react"
import { ShieldAlert, Globe, Zap, Bug } from "lucide-react"
import { Surface } from "@/components/ui/surface"
import { useT } from "@/components/locale-provider"
import type { TranslationKey } from "@/lib/i18n/dictionaries"

type Summary = {
  totalToday: number
  byType: { type: string; count: number }[]
  topIps: { ip: string; count: number }[]
}

const TYPE_LABEL_KEYS: Record<string, TranslationKey> = {
  scanner:     "defense.type.scanner",
  path_probe:  "defense.type.pathProbe",
  injection:   "defense.type.injection",
  brute_force: "defense.type.bruteForce",
  rate_limit:  "defense.type.rateLimit",
}

export function DefenseStats() {
  const t = useT()
  const [data, setData] = useState<Summary | null>(null)

  useEffect(() => {
    fetch("/api/defense/summary")
      .then(r => r.ok ? r.json() : null)
      .then((d: unknown) => { if (d && typeof d === "object") setData(d as Summary) })
      .catch(() => {})
  }, [])

  const topType  = data?.byType[0]
  const topIp    = data?.topIps[0]

  const metrics = [
    { icon: ShieldAlert, label: t("defense.stat.attacksToday"),  value: data ? data.totalToday.toLocaleString() : "—", color: data?.totalToday ? "text-red-400" : "text-emerald-400", bg: data?.totalToday ? "bg-red-400/10" : "bg-emerald-400/10" },
    { icon: Globe,       label: t("defense.stat.uniqueIps"),      value: data ? (data.topIps.length >= 10 ? "10+" : String(data.topIps.length)) : "—", color: "text-blue-400",   bg: "bg-blue-400/10" },
    { icon: Bug,         label: t("defense.stat.topAttackType"), value: topType ? (TYPE_LABEL_KEYS[topType.type] ? t(TYPE_LABEL_KEYS[topType.type]) : topType.type) : "—", color: "text-orange-400", bg: "bg-orange-400/10" },
    { icon: Zap,         label: t("defense.stat.topAttacker"),    value: topIp ? topIp.ip : "—", color: "text-purple-400", bg: "bg-purple-400/10" },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {metrics.map(({ icon: Icon, label, value, color, bg }) => (
        <Surface key={label} className="px-4 py-3 flex items-center gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div className="min-w-0">
            <p className={`text-lg font-semibold tabular-nums leading-tight truncate ${color}`}>{value}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        </Surface>
      ))}
    </div>
  )
}
