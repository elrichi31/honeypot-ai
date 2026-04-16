"use client"

import { useState } from "react"
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps"
import { Plus, Minus, Maximize2, Globe } from "lucide-react"
import { ISO_A2_TO_NUM } from "@/lib/iso-codes"
import type { WebCountryAttack } from "@/lib/geo"
import Link from "next/link"

const GEO_URL = "/world-110m.json"

const ATTACK_LABELS: Record<string, string> = {
  sqli:            "SQL Injection",
  xss:             "XSS",
  lfi:             "LFI",
  rfi:             "RFI",
  cmdi:            "Cmd Injection",
  scanner:         "Scanner",
  info_disclosure: "Info Disclosure",
  recon:           "Recon",
}

const ATTACK_COLORS_HEX: Record<string, string> = {
  sqli:            "#ef4444",
  xss:             "#f97316",
  lfi:             "#eab308",
  rfi:             "#ca8a04",
  cmdi:            "#a855f7",
  scanner:         "#3b82f6",
  info_disclosure: "#06b6d4",
  recon:           "#6b7280",
}

const ATTACK_BADGE: Record<string, string> = {
  sqli:            "bg-red-500/15 text-red-400 border-red-500/30",
  xss:             "bg-orange-500/15 text-orange-400 border-orange-500/30",
  lfi:             "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  rfi:             "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  cmdi:            "bg-purple-500/15 text-purple-400 border-purple-500/30",
  scanner:         "bg-blue-500/15 text-blue-400 border-blue-500/30",
  info_disclosure: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  recon:           "bg-muted/50 text-muted-foreground border-border",
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("")
}

function getColor(hits: number, max: number): string {
  if (hits === 0 || max === 0) return "#1a1a2e"
  const t = Math.log1p(hits) / Math.log1p(max)
  const r = Math.round(20  + t * 40)
  const g = Math.round(80  + t * 40)
  const b = Math.round(200 - t * 60)
  return `rgb(${r},${g},${b})`
}

const DEFAULT_CENTER: [number, number] = [0, 10]

export function WebGeoMap({ countries, totalHits }: { countries: WebCountryAttack[]; totalHits: number }) {
  const [tooltip, setTooltip] = useState<WebCountryAttack | null>(null)
  const [position, setPosition] = useState<{ coordinates: [number, number]; zoom: number }>({
    coordinates: DEFAULT_CENTER,
    zoom: 1,
  })

  const maxHits = countries[0]?.totalHits ?? 0

  const countByNumeric = new Map<number, WebCountryAttack>()
  for (const c of countries) {
    const num = ISO_A2_TO_NUM[c.country]
    if (num !== undefined) countByNumeric.set(num, c)
  }

  function zoom(factor: number) {
    setPosition((p) => ({ ...p, zoom: Math.min(8, Math.max(1, p.zoom * factor)) }))
  }

  return (
    <div className="space-y-6">
      {/* Map card */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground">Origen de ataques HTTP</h3>
            <p className="text-sm text-muted-foreground">
              {countries.length > 0
                ? `${countries.length} países · intensidad = hits totales`
                : "Sin IPs geolocalizadas aún"}
            </p>
          </div>

          {tooltip && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm shrink-0">
              <span className="text-lg">{countryFlag(tooltip.country)}</span>
              <span className="font-semibold text-foreground">{tooltip.name}</span>
              <span className="text-muted-foreground">{tooltip.totalHits.toLocaleString()} hits</span>
              <span className="text-muted-foreground">{tooltip.uniqueIps} IPs</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ATTACK_BADGE[tooltip.topType] ?? ATTACK_BADGE.recon}`}>
                {ATTACK_LABELS[tooltip.topType] ?? tooltip.topType}
              </span>
            </div>
          )}
        </div>

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
              onMoveEnd={(pos) => setPosition({ coordinates: pos.coordinates as [number, number], zoom: pos.zoom })}
              minZoom={1}
              maxZoom={8}
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const ca   = countByNumeric.get(Number(geo.id))
                    const fill = getColor(ca?.totalHits ?? 0, maxHits)
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke={ca ? "rgba(80,140,255,0.35)" : "#1e1e35"}
                        strokeWidth={ca ? 0.6 : 0.3}
                        style={{
                          default: { outline: "none" },
                          hover: {
                            outline: "none",
                            fill: ca ? "#6090ff" : "#252540",
                            cursor: ca ? "pointer" : "default",
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
            {[{ icon: Plus, fn: () => zoom(1.5) }, { icon: Minus, fn: () => zoom(1 / 1.5) }, { icon: Maximize2, fn: () => setPosition({ coordinates: DEFAULT_CENTER, zoom: 1 }) }].map(({ icon: Icon, fn }, i) => (
              <button key={i} onClick={fn} className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white/70 backdrop-blur-sm hover:bg-black/80 hover:text-white">
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          {/* Legend */}
          {countries.length > 0 && (
            <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-sm">
              <div className="h-2 w-16 rounded-full" style={{ background: "linear-gradient(to right, rgb(20,80,200), rgb(60,120,240))" }} />
              <span className="text-[10px] text-white/60">Low → High</span>
            </div>
          )}

          {countries.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <Globe className="h-8 w-8 text-white/20" />
              <p className="text-sm font-medium text-white/40">Sin datos geolocalizables</p>
              <p className="text-xs text-white/25">Las IPs privadas/Docker no tienen geo</p>
            </div>
          )}
        </div>
      </div>

      {/* Country ranking table */}
      {countries.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border p-4">
            <h3 className="font-semibold text-foreground">Ranking por país</h3>
            <p className="text-xs text-muted-foreground">Ordenado por total de hits · click en una IP para ver su detalle</p>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">País</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Hits</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">IPs únicas</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Top amenaza</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">% del total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {countries.map((c, i) => {
                  const pct    = totalHits > 0 ? (c.totalHits / totalHits) * 100 : 0
                  const color  = ATTACK_COLORS_HEX[c.topType] ?? "#6b7280"
                  return (
                    <tr key={c.country} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{countryFlag(c.country)}</span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{c.country}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-sm font-semibold text-foreground">
                        {c.totalHits.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-muted-foreground">
                        {c.uniqueIps}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ATTACK_BADGE[c.topType] ?? ATTACK_BADGE.recon}`}>
                          {ATTACK_LABELS[c.topType] ?? c.topType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 w-40">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-muted">
                            <div
                              className="h-1.5 rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </div>
                          <span className="w-10 text-right font-mono text-xs text-muted-foreground">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
