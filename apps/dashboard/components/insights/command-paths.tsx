"use client"

import { Route } from "lucide-react"
import type { DashboardInsights } from "@/lib/api"
import { Surface } from "@/components/ui/surface"
import { useT } from "@/components/locale-provider"

function truncateSequence(sequence: string, max = 96) {
  if (sequence.length <= max) return sequence
  return `${sequence.slice(0, max - 1)}...`
}

type Props = { patterns: DashboardInsights["commandPatterns"] }

export function CommandPaths({ patterns }: Props) {
  const t = useT()
  return (
    <Surface className="p-5">
      <div className="mb-5 flex items-center gap-2">
        <Route className="h-4 w-4 text-cyan-400" />
        <div>
          <h2 className="font-semibold text-foreground">{t("dash.commands.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("dash.commands.subtitle")}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {patterns.map((pattern, index) => (
          <div key={`${pattern.sequence}-${index}`} className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("dash.commands.pattern", { n: index + 1 })}</p>
                <code className="mt-2 block truncate font-mono text-sm text-foreground" title={pattern.sequence}>
                  {truncateSequence(pattern.sequence)}
                </code>
              </div>
              <div className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                {pattern.sessions}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("dash.commands.sourceIps", { n: pattern.uniqueIps })}</p>
          </div>
        ))}
      </div>
    </Surface>
  )
}
