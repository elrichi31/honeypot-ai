"use client"

import { useEffect, useState, useRef } from "react"
import { Loader2, Flame } from "lucide-react"

interface Cell { dow: number; hour: number; count: number }
interface HeatmapData {
  cells: Cell[]
  maxCount: number
  totalSessions: number
  hourTotals: number[]
  days: number
}

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const HOUR_LABELS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"]

function cellColor(count: number, max: number): string {
  if (count === 0 || max === 0) return "bg-secondary/40"
  const ratio = count / max
  if (ratio < 0.15) return "bg-blue-900/60"
  if (ratio < 0.30) return "bg-indigo-700/70"
  if (ratio < 0.50) return "bg-yellow-600/80"
  if (ratio < 0.75) return "bg-orange-500"
  return "bg-destructive"
}

const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon→Sun

export function AttackHeatmap({ days = 90 }: { days?: number }) {
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<{ dow: number; hour: number; count: number; x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/stats/heatmap?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [days])

  if (loading) return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Cargando heatmap…
    </div>
  )
  if (!data) return null

  const matrix: Record<number, Record<number, number>> = {}
  for (const c of data.cells) {
    if (!matrix[c.dow]) matrix[c.dow] = {}
    matrix[c.dow][c.hour] = c.count
  }

  const peakHour = data.hourTotals.indexOf(Math.max(...data.hourTotals))
  const peakDowIdx = DAYS_ORDER.reduce((best, dow) => {
    const total = Object.values(matrix[dow] ?? {}).reduce((s, v) => s + v, 0)
    const bestTotal = Object.values(matrix[best] ?? {}).reduce((s, v) => s + v, 0)
    return total > bestTotal ? dow : best
  }, 0)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <h3 className="font-semibold text-foreground">Attack Heatmap</h3>
          <span className="text-xs text-muted-foreground">últimos {data.days} días</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>Pico: <strong className="text-foreground">{peakHour}:00h</strong></span>
          <span>Día más activo: <strong className="text-foreground">{DAYS[peakDowIdx]}</strong></span>
        </div>
      </div>

      <div className="p-4" ref={containerRef}>
        {/* Hour labels */}
        <div className="mb-1 flex pl-9">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center">
              {h % 3 === 0 && (
                <span className="text-[9px] text-muted-foreground">{HOUR_LABELS[h / 3]}</span>
              )}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="space-y-0.5">
          {DAYS_ORDER.map(dow => (
            <div key={dow} className="flex items-center gap-1">
              <span className="w-8 shrink-0 text-[10px] text-muted-foreground text-right">{DAYS[dow]}</span>
              <div className="flex flex-1 gap-0.5">
                {Array.from({ length: 24 }, (_, h) => {
                  const count = matrix[dow]?.[h] ?? 0
                  return (
                    <div
                      key={h}
                      className={`flex-1 rounded-[2px] cursor-default transition-opacity hover:opacity-80 ${cellColor(count, data.maxCount)}`}
                      style={{ aspectRatio: "1 / 1.1" }}
                      onMouseEnter={e => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        const containerRect = containerRef.current!.getBoundingClientRect()
                        setTooltip({ dow, hour: h, count, x: rect.left - containerRect.left + rect.width / 2, y: rect.top - containerRect.top - 8 })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Hour bar chart */}
        <div className="mt-3 flex items-end gap-0.5 pl-9" style={{ height: 36 }}>
          {data.hourTotals.map((v, h) => {
            const maxH = Math.max(...data.hourTotals)
            const pct = maxH > 0 ? (v / maxH) * 100 : 0
            return (
              <div key={h} className="flex-1 flex items-end">
                <div
                  className={`w-full rounded-t-[1px] ${h === peakHour ? "bg-orange-400" : "bg-muted-foreground/30"}`}
                  style={{ height: `${Math.max(pct, 2)}%` }}
                />
              </div>
            )
          })}
        </div>
        <p className="mt-1 pl-9 text-[9px] text-muted-foreground">ataques por hora del día (total)</p>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-2 pl-9">
          <span className="text-[10px] text-muted-foreground">Menos</span>
          {["bg-secondary/40", "bg-blue-900/60", "bg-indigo-700/70", "bg-yellow-600/80", "bg-orange-500", "bg-destructive"].map(c => (
            <div key={c} className={`h-3 w-5 rounded-[2px] ${c}`} />
          ))}
          <span className="text-[10px] text-muted-foreground">Más</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          <p className="font-medium text-foreground">{DAYS[tooltip.dow]} {tooltip.hour}:00–{tooltip.hour + 1}:00</p>
          <p className="text-muted-foreground">{tooltip.count.toLocaleString('en-US')} sesiones</p>
        </div>
      )}
    </div>
  )
}
