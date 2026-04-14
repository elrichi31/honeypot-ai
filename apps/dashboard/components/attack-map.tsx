"use client"

import { useState } from "react"
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps"
import { Plus, Minus, Maximize2, ShieldX, Globe } from "lucide-react"
import type { CountryAttack } from "@/lib/types"
import { ISO_A2_TO_NUM } from "@/lib/iso-codes"

const GEO_URL = "/world-110m.json"

interface AttackMapProps {
  countryAttacks: CountryAttack[]
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("")
}

function getColor(count: number, max: number): string {
  if (count === 0 || max === 0) return "#1a1a2e"
  const t = Math.log1p(count) / Math.log1p(max)
  const r = Math.round(80  + t * 175)
  const g = Math.round(20  + t * 30)
  const b = Math.round(120 - t * 90)
  return `rgb(${r},${g},${b})`
}

const DEFAULT_CENTER: [number, number] = [0, 10]
const DEFAULT_ZOOM = 1

export function AttackMap({ countryAttacks }: AttackMapProps) {
  const [tooltip, setTooltip] = useState<CountryAttack | null>(null)
  const [position, setPosition] = useState<{
    coordinates: [number, number]
    zoom: number
  }>({ coordinates: DEFAULT_CENTER, zoom: DEFAULT_ZOOM })

  const countByNumeric = new Map<number, CountryAttack>()
  for (const ca of countryAttacks) {
    const num = ISO_A2_TO_NUM[ca.country]
    if (num !== undefined) countByNumeric.set(num, ca)
  }

  const maxSessions = countryAttacks[0]?.sessions ?? 0
  const totalSessions = countryAttacks.reduce((s, c) => s + c.sessions, 0)
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
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-foreground">Attack Origins</h3>
          <p className="text-sm text-muted-foreground">
            {hasData
              ? `${countryAttacks.length} países · ${totalSessions} sesiones totales`
              : "No external IPs geolocated yet"}
          </p>
        </div>

        {/* Hover tooltip */}
        {tooltip && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm shrink-0">
            <span className="text-lg">{countryFlag(tooltip.country)}</span>
            <span className="font-semibold text-foreground">{tooltip.name}</span>
            <span className="text-muted-foreground">{tooltip.sessions} sesiones</span>
            {tooltip.successfulLogins > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
                <ShieldX className="h-3 w-3" />
                {tooltip.successfulLogins} comprometidas
              </span>
            )}
          </div>
        )}
      </div>

      {/* Map */}
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{ background: "#0d0d1a", aspectRatio: "2.4 / 1" }}
      >
        <ComposableMap
          projection="geoNaturalEarth1"
          projectionConfig={{ scale: 160, center: [0, 10] }}
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
                  const fill = getColor(ca?.sessions ?? 0, maxSessions)
                  const isAttacker = !!ca

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke={isAttacker ? "rgba(255,80,60,0.4)" : "#1e1e35"}
                      strokeWidth={isAttacker ? 0.6 : 0.3}
                      style={{
                        default: { outline: "none" },
                        hover: {
                          outline: "none",
                          fill: isAttacker ? "#ff6b35" : "#252540",
                          cursor: isAttacker ? "pointer" : "default",
                        },
                        pressed: { outline: "none" },
                      }}
                      onMouseEnter={() => { if (ca) setTooltip(ca) }}
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
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => zoom(1 / 1.5)}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={reset}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </div>

        {/* Legend */}
        {hasData && (
          <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-sm">
            <div
              className="h-2 w-16 rounded-full"
              style={{ background: "linear-gradient(to right, rgb(80,20,120), rgb(255,50,30))" }}
            />
            <span className="text-[10px] text-white/60">Low → High</span>
          </div>
        )}

        {position.zoom > 1 && (
          <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] text-white/50">{position.zoom.toFixed(1)}×</span>
          </div>
        )}

        {!hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Globe className="h-8 w-8 text-white/20" />
            <p className="text-sm font-medium text-white/40">Waiting for external connections</p>
            <p className="text-xs text-white/25">Private / Docker IPs are not geolocatable</p>
          </div>
        )}
      </div>

      {/* Country stats */}
      {hasData && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {countryAttacks.slice(0, 9).map((ca, i) => {
            const pct = Math.round((ca.sessions / totalSessions) * 100)
            const compromisePct = ca.sessions > 0
              ? Math.round((ca.successfulLogins / ca.sessions) * 100)
              : 0

            return (
              <div
                key={ca.country}
                className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2"
              >
                {/* Rank */}
                <span className="w-4 shrink-0 text-right text-xs font-mono text-muted-foreground/60">
                  {i + 1}
                </span>

                {/* Flag + name */}
                <span className="text-base shrink-0">{countryFlag(ca.country)}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">{ca.name}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{ca.sessions} sesiones</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{ca.count} IPs</span>
                  </div>
                </div>

                {/* Right: pct + compromise badge */}
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold text-foreground">{pct}%</p>
                  {ca.successfulLogins > 0 && (
                    <p className="text-[11px] text-destructive font-medium">
                      {compromisePct}% comp.
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
