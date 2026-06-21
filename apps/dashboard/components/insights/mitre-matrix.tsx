"use client"

import React from "react"
import { Grid3x3 } from "lucide-react"
import { useT } from "@/components/locale-provider"
import type { MitreMatrix } from "@/lib/api"
import { Surface } from "@/components/ui/surface"
import { heatmapColor } from "@/lib/heatmap-color"

type Props = { matrix: MitreMatrix }

function cellStyle(count: number, max: number): React.CSSProperties {
  const bg = heatmapColor(count, max)
  const ratio = max > 0 ? count / max : 0
  return {
    backgroundColor: bg,
    color: ratio > 0.55 ? "#fecaca" : "#f1f5f9",
    borderColor: bg,
  }
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
              {col.techniques.map((tech) => {
                const style = cellStyle(tech.count, max)
                return (
                  <div
                    key={tech.id}
                    style={style}
                    className="rounded-lg border p-3 transition-colors"
                    title={`${tech.id} · ${tech.name} — ${tech.count.toLocaleString("en-US")}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold" style={{ color: style.color }}>{tech.id}</span>
                      <span className="text-xs font-semibold" style={{ color: style.color }}>{tech.count.toLocaleString("en-US")}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs" style={{ color: style.color, opacity: 0.75 }}>{tech.name}</p>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </Surface>
  )
}
