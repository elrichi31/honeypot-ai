"use client"

import { useEffect, useRef, useState } from "react"
import createGlobe from "cobe"
import { ShieldX, Maximize2, Minimize2 } from "lucide-react"
import type { CountryAttack } from "@/lib/types"
import { useGlobePointer } from "@/hooks/use-globe-pointer"
import { useGlobeLabels } from "@/hooks/use-globe-labels"
import { Surface } from "@/components/ui/surface"

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

const THETA = 0.3
const MIN_MARKER_SIZE = 0.018
const MAX_MARKER_SIZE = 0.052

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("")
}

function buildMarkers(countryAttacks: CountryAttack[], maxSessions: number) {
  return countryAttacks
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
}

interface GlobeMapProps {
  countryAttacks: CountryAttack[]
}

export function GlobeMap({ countryAttacks }: GlobeMapProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const pointer = useGlobePointer()
  const { updateLabels } = useGlobeLabels(labelsRef, countryAttacks, CENTROIDS)

  const maxSessions = Math.max(1, countryAttacks[0]?.sessions ?? 1)
  const totalSessions = countryAttacks.reduce((s, c) => s + c.sessions, 0)
  const hasData = countryAttacks.length > 0
  const markers = buildMarkers(countryAttacks, maxSessions)

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      cardRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let width = canvas.offsetWidth
    const onResize = () => { width = canvas.offsetWidth }
    window.addEventListener("resize", onResize)

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

    let rafId = 0
    const render = () => {
      if (!pointer.isDraggingRef.current) pointer.phiRef.current += 0.005
      const renderedPhi = pointer.phiRef.current + pointer.movementRef.current
      globe.update({ phi: renderedPhi, width: width * 2, height: width * 2 })
      updateLabels(renderedPhi, THETA, width)
      rafId = requestAnimationFrame(render)
    }

    setTimeout(() => { canvas.style.opacity = "1" }, 0)
    rafId = requestAnimationFrame(render)
    const detach = pointer.attachTo(canvas)

    return () => {
      cancelAnimationFrame(rafId)
      globe.destroy()
      detach()
      window.removeEventListener("resize", onResize)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryAttacks.length])

  return (
    <Surface ref={cardRef} className="p-5 [&:fullscreen]:overflow-auto [&:fullscreen]:rounded-none">
      <GlobeHeader
        hasData={hasData}
        countryCount={countryAttacks.length}
        totalSessions={totalSessions}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
        <div className="flex items-center justify-center">
          <div className="relative w-full max-w-[650px]" style={{ aspectRatio: "1" }}>
            <canvas
              ref={canvasRef}
              style={{
                width: "100%", height: "100%",
                opacity: 0, transition: "opacity 1s ease",
                cursor: "grab", contain: "layout paint size", display: "block",
              }}
            />
            <div ref={labelsRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
          </div>
        </div>

        <CountryList countryAttacks={countryAttacks} totalSessions={totalSessions} />
      </div>
    </Surface>
  )
}

interface GlobeHeaderProps {
  hasData: boolean
  countryCount: number
  totalSessions: number
  isFullscreen: boolean
  onToggleFullscreen: () => void
}

function GlobeHeader({ hasData, countryCount, totalSessions, isFullscreen, onToggleFullscreen }: GlobeHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h3 className="font-semibold text-foreground">Attack Origins</h3>
        <p className="text-sm text-muted-foreground">
          {hasData
            ? `${countryCount} countries · ${totalSessions.toLocaleString("en-US")} SSH sessions`
            : "No external connections yet"}
        </p>
      </div>
      <div className="flex items-center gap-4">
        {hasData && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              Compromised
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
              Attempts only
            </span>
          </div>
        )}
        <button
          onClick={onToggleFullscreen}
          className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

interface CountryListProps {
  countryAttacks: CountryAttack[]
  totalSessions: number
}

function CountryList({ countryAttacks, totalSessions }: CountryListProps) {
  return (
    <div className="flex flex-col gap-1.5 overflow-auto py-2">
      {countryAttacks.slice(0, 12).map((ca, i) => (
        <CountryRow key={ca.country} ca={ca} rank={i + 1} totalSessions={totalSessions} />
      ))}
      {countryAttacks.length === 0 && (
        <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
          No geographic data yet
        </div>
      )}
    </div>
  )
}

interface CountryRowProps {
  ca: CountryAttack
  rank: number
  totalSessions: number
}

function CountryRow({ ca, rank, totalSessions }: CountryRowProps) {
  const pct = Math.round((ca.sessions / totalSessions) * 100)
  const compromisePct = ca.sessions > 0 ? Math.round((ca.successfulLogins / ca.sessions) * 100) : 0

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2">
      <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground/50">{rank}</span>
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
        <p className="text-xs font-semibold text-foreground">{ca.sessions.toLocaleString("en-US")}</p>
        {ca.successfulLogins > 0 && (
          <p className="flex items-center justify-end gap-0.5 text-[10px] text-destructive">
            <ShieldX className="h-2.5 w-2.5" />
            {compromisePct}%
          </p>
        )}
      </div>
    </div>
  )
}
