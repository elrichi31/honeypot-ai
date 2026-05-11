"use client"

import Link from "next/link"
import { ArrowRight, Workflow } from "lucide-react"
import type { DashboardInsights } from "@/lib/api"

const FUNNEL_COLORS = ["#60a5fa", "#38bdf8", "#34d399", "#f59e0b", "#ef4444"]

function percent(part: number, whole: number) {
  if (!whole) return 0
  return Number(((part / whole) * 100).toFixed(1))
}

type Props = { funnel: DashboardInsights["funnel"] }

export function AttackFunnel({ funnel }: Props) {
  const stages = [
    { label: "Connections", count: funnel.connections, conversion: 100 },
    { label: "Tried auth", count: funnel.authAttempts, conversion: percent(funnel.authAttempts, funnel.connections) },
    { label: "Successful login", count: funnel.loginSuccess, conversion: percent(funnel.loginSuccess, funnel.authAttempts) },
    { label: "Executed commands", count: funnel.commands, conversion: percent(funnel.commands, funnel.loginSuccess) },
    { label: "High-signal compromise", count: funnel.highSignalCompromise, conversion: percent(funnel.highSignalCompromise, funnel.commands) },
  ]

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-sky-400" />
            <h2 className="font-semibold text-foreground">Attack Depth Funnel</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Shows how much raw noise actually becomes meaningful intrusion activity
          </p>
        </div>
        <Link
          href="/sessions?tab=sessions&actor=all"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Explore sessions <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid gap-3 xl:grid-cols-5">
        {stages.map((stage, index) => (
          <div key={stage.label} className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{stage.label}</span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FUNNEL_COLORS[index] }} />
            </div>
            <p className="mt-3 text-3xl font-semibold text-foreground">
              {stage.count.toLocaleString("en-US")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {index === 0 ? "baseline" : `${stage.conversion}% from previous stage`}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(3, percent(stage.count, funnel.connections))}%`,
                  backgroundColor: FUNNEL_COLORS[index],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
