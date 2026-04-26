"use client"

import { useEffect, useRef } from "react"
import createGlobe from "cobe"
import { ShieldX } from "lucide-react"
import type { CountryAttack } from "@/lib/types"

const CENTROIDS: Record<string, [number, number]> = {
  CN: [35.86, 104.19],  US: [37.09, -95.71],  RU: [61.52, 105.31],
  DE: [51.16, 10.45],   GB: [55.37, -3.43],   IN: [20.59, 78.96],
  BR: [-14.23, -51.92], NL: [52.13, 5.29],    FR: [46.22, 2.21],
  JP: [36.20, 138.25],  KR: [35.90, 127.76],  SG: [1.35, 103.82],
  HK: [22.39, 114.10],  TW: [23.69, 120.96],  UA: [48.37, 31.16],
  VN: [14.05, 108.27],  ID: [-0.78, 113.92],  TR: [38.96, 35.24],
  IT: [41.87, 12.56],   PL: [51.91, 19.14],   CA: [56.13, -106.35],
  AU: [-25.27, 133.77], SE: [60.12, 18.64],   MX: [23.63, -102.55],
  TH: [15.87, 100.99],  AR: [-38.41, -63.61], ZA: [-30.56, 22.94],
  IR: [32.42, 53.68],   PK: [30.37, 69.34],   BD: [23.68, 90.35],
  NG: [9.08, 8.67],     EG: [26.82, 30.80],   RO: [45.94, 24.96],
  CZ: [49.81, 15.47],   BG: [42.73, 25.48],   AT: [47.51, 14.55],
  CH: [46.81, 8.22],    ES: [40.46, -3.74],   PT: [39.39, -8.22],
  BE: [50.50, 4.46],    GR: [39.07, 21.82],   HU: [47.16, 19.50],
  BY: [53.70, 27.95],   KZ: [48.01, 66.92],   MY: [4.21, 101.97],
  PH: [12.87, 121.77],  CL: [-35.67, -71.54], PE: [-9.18, -75.01],
  CO: [4.57, -74.29],   IL: [31.04, 34.85],   SA: [23.88, 45.07],
  AE: [23.42, 53.84],   NO: [60.47, 8.46],    FI: [61.92, 25.74],
  DK: [56.26, 9.50],    LT: [55.16, 23.88],   LV: [56.87, 24.60],
  EE: [58.59, 25.01],   RS: [44.01, 21.00],   MD: [47.41, 28.37],
  KP: [40.33, 127.51],
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("")
}

function latLngTo3D(lat: number, lng: number): [number, number, number] {
  const r = (lat * Math.PI) / 180
  const a = (lng * Math.PI) / 180 - Math.PI
  const o = Math.cos(r)
  return [-o * Math.cos(a), Math.sin(r), o * Math.sin(a)]
}

function projectTo2D(
  v: [number, number, number],
  phi: number,
  theta: number,
): { x: number; y: number; visible: boolean } {
  const cr = Math.cos(theta), ca = Math.cos(phi)
  const sr = Math.sin(theta), sa = Math.sin(phi)
  const c = ca * v[0] + sa * v[2]
  const s = sa * sr * v[0] + cr * v[1] - ca * sr * v[2]
  const z = -sa * cr * v[0] + sr * v[1] + ca * cr * v[2]
  return { x: (c + 1) / 2, y: (-s + 1) / 2, visible: z >= 0 }
}

interface GlobeMapProps {
  countryAttacks: CountryAttack[]
}

const THETA = 0.3
const MIN_MARKER_SIZE = 0.018
const MAX_MARKER_SIZE = 0.052
const LABEL_COLLISION_DISTANCE = 42
const LABEL_EDGE_PADDING = 24

export function GlobeMap({ countryAttacks }: GlobeMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const pointerInteracting = useRef<number | null>(null)
  const pointerInteractionMovement = useRef(0)
  const labelElemsRef = useRef<Array<{
    el: HTMLDivElement
    priority: number
    v: [number, number, number]
  }>>([])

  const maxSessions = Math.max(1, countryAttacks[0]?.sessions ?? 1)
  const totalSessions = countryAttacks.reduce((s, c) => s + c.sessions, 0)
  const hasData = countryAttacks.length > 0

  const markers = countryAttacks
    .map((ca) => {
      const coords = CENTROIDS[ca.country]
      if (!coords) return null
      const t = Math.log1p(ca.sessions) / Math.log1p(maxSessions)
      return {
        location: coords as [number, number],
        size: MIN_MARKER_SIZE + t * (MAX_MARKER_SIZE - MIN_MARKER_SIZE),
        color: ca.successfulLogins > 0
          ? ([1.0, 0.22, 0.14] as [number, number, number])
          : ([0.45, 0.32, 1.0] as [number, number, number]),
      }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)

  // Build label DOM elements imperatively (updated 60fps without React re-renders)
  useEffect(() => {
    const container = labelsRef.current
    if (!container) return

    container.innerHTML = ""
    labelElemsRef.current = []

    const labeledCountries = countryAttacks
      .filter((ca) => CENTROIDS[ca.country])
      .sort((a, b) => b.sessions - a.sessions)

    for (const ca of labeledCountries) {
      const coords = CENTROIDS[ca.country]
      if (!coords) continue

      const compromised = ca.successfulLogins > 0
      const dotColor = compromised ? "#ef4444" : "#7c3aed"

      const el = document.createElement("div")
      el.style.cssText =
        "position:absolute;pointer-events:none;transform:translate(-50%,-130%);transition:opacity 0.15s;"
      el.innerHTML = `
        <div style="
          background:rgba(10,10,20,0.82);
          border:1px solid rgba(255,255,255,0.12);
          border-radius:7px;
          padding:4px 8px;
          display:flex;
          align-items:center;
          gap:5px;
          backdrop-filter:blur(6px);
          box-shadow:0 2px 12px rgba(0,0,0,0.5);
          white-space:nowrap;
        ">
          <span style="font-size:13px;line-height:1">${countryFlag(ca.country)}</span>
          <span style="font-size:10px;font-weight:600;color:#fff">${ca.name}</span>
          <span style="
            font-size:9px;
            font-weight:700;
            color:${dotColor};
            background:${dotColor}22;
            border-radius:4px;
            padding:1px 4px;
          ">${ca.sessions.toLocaleString('en-US')}</span>
        </div>
        <div style="
          position:absolute;
          bottom:-5px;
          left:50%;
          transform:translateX(-50%);
          width:0;height:0;
          border-left:4px solid transparent;
          border-right:4px solid transparent;
          border-top:5px solid rgba(255,255,255,0.12);
        "></div>
      `
      container.appendChild(el)
      labelElemsRef.current.push({
        el,
        priority: ca.sessions,
        v: latLngTo3D(coords[0], coords[1]),
      })
    }

    return () => {
      container.innerHTML = ""
      labelElemsRef.current = []
    }
  }, [countryAttacks])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let phi = 0
    let width = canvas.offsetWidth
    let rafId = 0

    const onResize = () => { width = canvas.offsetWidth }
    window.addEventListener("resize", onResize)
    onResize()

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: THETA,
      dark: 1,
      diffuse: 3,
      mapSamples: 16000,
      mapBrightness: 1.65,
      baseColor: [0.6, 0.6, 0.7],
      markerColor: [251 / 255, 100 / 255, 21 / 255],
      glowColor: [0.18, 0.15, 0.28],
      markers,
    })

    const render = () => {
      if (pointerInteracting.current === null) phi += 0.005
      const renderedPhi = phi + pointerInteractionMovement.current

      globe.update({ phi: renderedPhi, width: width * 2, height: width * 2 })

      // Update label positions directly in DOM. Labels are created for every
      // marker, then deconflicted so dense regions like Europe stay readable.
      const placedLabels: Array<{ x: number; y: number }> = []
      const sortedLabels = [...labelElemsRef.current].sort((a, b) => b.priority - a.priority)

      for (const { el, v } of sortedLabels) {
        const { x, y, visible } = projectTo2D(v, renderedPhi, THETA)
        const px = x * width
        const py = y * width
        const insideFrame =
          px > LABEL_EDGE_PADDING &&
          px < width - LABEL_EDGE_PADDING &&
          py > LABEL_EDGE_PADDING &&
          py < width - LABEL_EDGE_PADDING
        const collides = placedLabels.some((p) => {
          const dx = p.x - px
          const dy = p.y - py
          return Math.sqrt(dx * dx + dy * dy) < LABEL_COLLISION_DISTANCE
        })

        if (visible && insideFrame && !collides) {
          el.style.left = `${x * 100}%`
          el.style.top = `${y * 100}%`
          el.style.opacity = "1"
          el.style.display = "block"
          placedLabels.push({ x: px, y: py })
        } else {
          el.style.opacity = "0"
          el.style.display = "none"
        }
      }

      rafId = requestAnimationFrame(render)
    }
    rafId = requestAnimationFrame(render)

    const onPointerDown = (e: PointerEvent) => {
      pointerInteracting.current = e.clientX - pointerInteractionMovement.current
      canvas.style.cursor = "grabbing"
    }
    const onPointerMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        pointerInteractionMovement.current = e.clientX - pointerInteracting.current
      }
    }
    const onPointerUp = () => {
      if (pointerInteracting.current !== null) {
        phi += pointerInteractionMovement.current
        pointerInteractionMovement.current = 0
        pointerInteracting.current = null
      }
      canvas.style.cursor = "grab"
    }

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointerout", onPointerUp)

    setTimeout(() => { canvas.style.opacity = "1" }, 0)

    return () => {
      cancelAnimationFrame(rafId)
      globe.destroy()
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointerout", onPointerUp)
      window.removeEventListener("resize", onResize)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryAttacks.length])

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Attack Origins</h3>
          <p className="text-sm text-muted-foreground">
            {hasData
              ? `${countryAttacks.length} países · ${totalSessions.toLocaleString('en-US')} sesiones SSH`
              : "Sin conexiones externas aún"}
          </p>
        </div>
        {hasData && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              Comprometido
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
              Solo intentos
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
        {/* Globe */}
        <div className="flex items-center justify-center">
          <div className="relative w-full max-w-[650px]" style={{ aspectRatio: "1" }}>
            <canvas
              ref={canvasRef}
              style={{
                width: "100%",
                height: "100%",
                opacity: 0,
                transition: "opacity 1s ease",
                cursor: "grab",
                contain: "layout paint size",
                display: "block",
              }}
            />
            {/* Labels overlay — positioned absolutely, updated imperatively via labelElemsRef */}
            <div
              ref={labelsRef}
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            />
          </div>
        </div>

        {/* Country list */}
        <div className="flex flex-col gap-1.5 overflow-auto py-2">
          {countryAttacks.slice(0, 12).map((ca, i) => {
            const pct = Math.round((ca.sessions / totalSessions) * 100)
            const compromisePct = ca.sessions > 0
              ? Math.round((ca.successfulLogins / ca.sessions) * 100)
              : 0

            return (
              <div
                key={ca.country}
                className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2"
              >
                <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground/50">
                  {i + 1}
                </span>
                <span className="shrink-0 text-sm">{countryFlag(ca.country)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{ca.name}</p>
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, pct)}%`,
                        backgroundColor: ca.successfulLogins > 0 ? "#ef4444" : "#7c3aed",
                      }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold text-foreground">
                    {ca.sessions.toLocaleString('en-US')}
                  </p>
                  {ca.successfulLogins > 0 && (
                    <p className="flex items-center justify-end gap-0.5 text-[10px] text-destructive">
                      <ShieldX className="h-2.5 w-2.5" />
                      {compromisePct}%
                    </p>
                  )}
                </div>
              </div>
            )
          })}

          {countryAttacks.length === 0 && (
            <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
              Sin datos geográficos aún
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
