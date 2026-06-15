"use client"

import React from "react"
import { Grid3x3 } from "lucide-react"
import { useT } from "@/components/locale-provider"
import type { MitreMatrix } from "@/lib/api"
import { Surface } from "@/components/ui/surface"

type Props = { matrix: MitreMatrix }

// Heatmap: cold (dark navy) → warm (teal) → hot (bright amber/orange)
function cellStyle(count: number, max: number): React.CSSProperties {
  const ratio = max > 0 ? count / max : 0
  // Interpolate through 3 stops: 0 → navy, 0.5 → teal, 1 → amber
  let r: number, g: number, b: number
  if (ratio < 0.5) {
    const t = ratio / 0.5
    r = Math.round(14 + t * (20 - 14))
    g = Math.round(30 + t * (184 - 30))
    b = Math.round(63 + t * (166 - 63))
  } else {
    const t = (ratio - 0.5) / 0.5
    r = Math.round(20 + t * (245 - 20))
    g = Math.round(184 + t * (158 - 184))
    b = Math.round(166 + t * (11 - 166))
  }
  const textColor = ratio > 0.55 ? "#0f172a" : "#f1f5f9"
  return {
    backgroundColor: `rgb(${r},${g},${b})`,
    color: textColor,
    borderColor: `rgba(${r},${g},${b},0.3)`,
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
