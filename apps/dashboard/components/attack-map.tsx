"use client"

import { useState } from "react"
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps"
import { Plus, Minus, Maximize2 } from "lucide-react"
import type { CountryAttack } from "@/lib/types"
import { ISO_A2_TO_NUM } from "@/lib/iso-codes"

const GEO_URL = "/world-110m.json"

interface AttackMapProps {
  countryAttacks: CountryAttack[]
}

// Log scale color — darker purple for low counts, vivid red for high
function getColor(count: number, max: number): string {
  if (count === 0 || max === 0) return "#1e1e2e"
  const t = Math.log1p(count) / Math.log1p(max)
  const r = Math.round(80  + t * 175)
  const g = Math.round(20  + t * 30)
  const b = Math.round(120 - t * 90)
  return `rgb(${r},${g},${b})`
}

const DEFAULT_CENTER: [number, number] = [10, 20]
const DEFAULT_ZOOM = 1

export function AttackMap({ countryAttacks }: AttackMapProps) {
  const [tooltip, setTooltip] = useState<{ name: string; count: number } | null>(null)
  const [position, setPosition] = useState<{
    coordinates: [number, number]
    zoom: number
  }>({ coordinates: DEFAULT_CENTER, zoom: DEFAULT_ZOOM })

  const countByNumeric = new Map<number, CountryAttack>()
  for (const ca of countryAttacks) {
    const num = ISO_A2_TO_NUM[ca.country]
    if (num !== undefined) countByNumeric.set(num, ca)
  }

  const max = countryAttacks[0]?.count ?? 0
  const hasData = countryAttacks.length > 0

  function zoom(factor: number) {
    setPosition((p) => ({
      ...p,
      zoom: Math.min(8, Math.max(1, p.zoom * factor)),
    }))
  }

  function reset() {
    setPosition({ coordinates: DEFAULT_CENTER, zoom: DEFAULT_ZOOM })
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Attack Origins</h3>
          <p className="text-sm text-muted-foreground">
            {hasData
              ? `${countryAttacks.length} countries · scroll to zoom · drag to pan`
              : "No external IPs geolocated yet"}
          </p>
        </div>

        {/* Hover tooltip */}
        {tooltip && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm">
            <span className="font-semibold text-foreground">{tooltip.name}</span>
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
              {tooltip.count} session{tooltip.count !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Map */}
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{ background: "#0d0d1a", aspectRatio: "2.2 / 1" }}
      >
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 130, center: [10, 20] }}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup
            zoom={position.zoom}
            center={position.coordinates}
            onMoveEnd={(pos) =>
              setPosition({
                coordinates: pos.coordinates as [number, number],
                zoom: pos.zoom,
              })
            }
            minZoom={1}
            maxZoom={8}
          >

            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const numericId = Number(geo.id)
                  const ca = countByNumeric.get(numericId)
                  const fill = getColor(ca?.count ?? 0, max)
                  const isAttacker = !!ca

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke={isAttacker ? "rgba(255,80,60,0.4)" : "#2a2a3e"}
                      strokeWidth={isAttacker ? 0.6 : 0.3}
                      style={{
                        default: { outline: "none" },
                        hover: {
                          outline: "none",
                          fill: isAttacker ? "#ff6b35" : "#2a2a4a",
                          cursor: isAttacker ? "pointer" : "default",
                        },
                        pressed: { outline: "none" },
                      }}
                      onMouseEnter={() => {
                        if (ca) setTooltip({ name: ca.name, count: ca.count })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  )
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* Zoom controls */}
        <div className="absolute left-3 top-3 flex flex-col gap-1">
          <button
            onClick={() => zoom(1.5)}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
            title="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => zoom(1 / 1.5)}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
            title="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={reset}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
            title="Reset view"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </div>

        {/* Legend */}
        {hasData && (
          <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-sm">
            <div
              className="h-2.5 w-20 rounded-full"
              style={{
                background: "linear-gradient(to right, rgb(80,20,120), rgb(255,50,30))",
              }}
            />
            <span className="text-[10px] text-white/60">Low → High</span>
          </div>
        )}

        {/* Zoom indicator */}
        {position.zoom > 1 && (
          <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] text-white/50">{position.zoom.toFixed(1)}×</span>
          </div>
        )}

        {/* Empty state overlay */}
        {!hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <p className="text-sm font-medium text-white/40">
              Waiting for external connections
            </p>
            <p className="text-xs text-white/25">
              Private / Docker IPs are not geolocatable
            </p>
          </div>
        )}
      </div>

      {/* Top countries bar */}
      {hasData && (
        <div className="mt-3 flex flex-col gap-1.5">
          {countryAttacks.slice(0, 8).map((ca, i) => {
            const pct = Math.round((Math.log1p(ca.count) / Math.log1p(max)) * 100)
            return (
              <div key={ca.country} className="flex items-center gap-3 text-sm">
                <span className="w-4 text-right text-xs text-muted-foreground">{i + 1}</span>
                <span className="w-28 truncate text-xs font-medium text-foreground">{ca.name}</span>
                <div className="flex-1 overflow-hidden rounded-full bg-secondary h-1.5">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: getColor(ca.count, max),
                    }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-xs font-semibold text-foreground">
                  {ca.count}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
