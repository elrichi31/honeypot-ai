"use client"

import { Activity, Terminal, Globe, Shield, ShieldX } from "lucide-react"
import type { DashboardStats } from "@/lib/types"

interface StatsCardsProps {
  stats: DashboardStats
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: "Total Sessions",
      value: stats.totalSessions,
      icon: Activity,
      color: "text-chart-1",
      bgColor: "bg-chart-1/10",
    },
    {
      title: "Commands Executed",
      value: stats.totalCommands,
      icon: Terminal,
      color: "text-chart-2",
      bgColor: "bg-chart-2/10",
    },
    {
      title: "Unique IPs",
      value: stats.uniqueIps,
      icon: Globe,
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
    },
    {
      title: "Successful Logins",
      value: stats.successfulLogins,
      icon: Shield,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Failed Logins",
      value: stats.failedLogins,
      icon: ShieldX,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{card.title}</span>
            <div className={`rounded-lg p-2 ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </div>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  )
}
