"use client"

import { Grid3x3 } from "lucide-react"
import { useT } from "@/components/locale-provider"
import type { MitreMatrix } from "@/lib/api"
import { Surface } from "@/components/ui/surface"

type Props = { matrix: MitreMatrix }

// Background intensity scaled to the technique's share of the max count, so the
// busiest techniques read as "hot" — the T-Pot-style heatmap.
function cellStyle(count: number, max: number) {
  const ratio = max > 0 ? count / max : 0
  // 0.08 floor so even rare techniques stay visible against the card.
  const alpha = 0.08 + ratio * 0.52
  return { backgroundColor: `rgba(34, 211, 238, ${alpha.toFixed(3)})` }
}

export function MitreMatrixView({ matrix }: Props) {
  const t = useT()
  const max = Math.max(1, ...matrix.tactics.flatMap((col) => col.techniques.map((tech) => tech.count)))

  return (
    <Surface className="p-5">
      <div className="mb-5 flex items-center gap-2">
        <Grid3x3 className="h-4 w-4 text-cyan-400" />
        <div>
          <h2 className="font-semibold text-foreground">{t("dash.mitre.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("dash.mitre.subtitle")}</p>
        </div>
      </div>

      {matrix.tactics.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("dash.mitre.empty")}</p>
      ) : (
        <div className="grid auto-cols-[minmax(160px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
          {matrix.tactics.map((col) => (
            <div key={col.tactic} className="space-y-2">
              <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground" title={col.tactic}>
                {col.tactic}
              </p>
              {col.techniques.map((tech) => (
                <div
                  key={tech.id}
                  style={cellStyle(tech.count, max)}
                  className="rounded-lg border border-border/60 p-3 transition-colors"
                  title={`${tech.id} · ${tech.name} — ${tech.count.toLocaleString("en-US")}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-foreground">{tech.id}</span>
                    <span className="text-xs font-semibold text-foreground">{tech.count.toLocaleString("en-US")}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{tech.name}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Surface>
  )
}
