"use client"

import { useEffect, useRef } from "react"
import type React from "react"
import createGlobe from "cobe"
import { latLngTo3D, projectTo2D } from "@/lib/globe-math"
import type { GlobeArc, LiveMarkerEntry, SensorLocation } from "@/components/live-attack-map-types"

const GLOBE_THETA = 0.28

interface Props {
  visible: boolean
  sensors: SensorLocation[]
  liveMarkersRef: React.MutableRefObject<Map<string, LiveMarkerEntry>>
  globeArcsRef: React.MutableRefObject<GlobeArc[]>
}

export function LiveAttackGlobe({ visible, sensors, liveMarkersRef, globeArcsRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const rafRef = useRef<number>(0)
  const phiRef = useRef(0)
  const pointerRef = useRef<number | null>(null)
  const movementRef = useRef(0)
  const sensorsRef = useRef<SensorLocation[]>([])

  useEffect(() => { sensorsRef.current = sensors }, [sensors])
  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current
    if (!canvas) return
    let width = canvas.offsetWidth
    const onResize = () => { width = canvas.offsetWidth }
    window.addEventListener("resize", onResize)
    const globe = createLiveGlobe(canvas, width, phiRef.current)
    const render = () => {
      if (pointerRef.current === null) phiRef.current += 0.004
      const phi = phiRef.current + movementRef.current
      const now = Date.now()
      globe.update({ phi, width: width * 2, height: width * 2, markers: markers(liveMarkersRef.current, sensorsRef.current, now) })
      updateSvgArcs(svgRef.current, globeArcsRef, sensorsRef.current, phi, width, now)
      rafRef.current = requestAnimationFrame(render)
    }
    rafRef.current = requestAnimationFrame(render)
    return cleanupGlobe(canvas, globe.destroy, rafRef, onResize, pointerRef, movementRef, phiRef)
  }, [visible, liveMarkersRef, globeArcsRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    return bindPointer(canvas, pointerRef, movementRef, phiRef)
  }, [])

  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ display: visible ? "flex" : "none" }}>
      <div className="relative" style={{ width: "min(85%, 85vh)", aspectRatio: "1" }}>
        <canvas ref={canvasRef} style={canvasStyle} />
        <svg ref={svgRef} style={svgStyle} />
        <GlobeLegend />
      </div>
    </div>
  )
}

function createLiveGlobe(canvas: HTMLCanvasElement, width: number, phi: number) {
  return createGlobe(canvas, {
    devicePixelRatio: Math.min(window.devicePixelRatio, 2), width: width * 2, height: width * 2,
    phi, theta: GLOBE_THETA, dark: 1, diffuse: 3, mapSamples: 16000, mapBrightness: 1.65,
    baseColor: [0.25, 0.28, 0.45], markerColor: [1, 0.25, 0.25], glowColor: [0.18, 0.15, 0.28],
    markers: [],
  })
}

function markers(entriesMap: Map<string, LiveMarkerEntry>, sensors: SensorLocation[], now: number) {
  return [...attackMarkers(entriesMap, now), ...sensorMarkers(sensors, now)]
}

function attackMarkers(entriesMap: Map<string, LiveMarkerEntry>, now: number) {
  const entries = Array.from(entriesMap.values())
  const maxCount = Math.max(1, ...entries.map((entry) => entry.count))
  return entries.map((entry) => {
    const t = Math.log1p(entry.count) / Math.log1p(maxCount)
    const age = now - entry.lastHitAt
    const flash = entry.lastHitAt > 0 && age < 1800 ? 1 + (1 - age / 1800) * 1.2 : 1
    return { location: [entry.lat, entry.lng] as [number, number], size: (0.018 + t * 0.042) * flash, color: typeToGlobeColor(entry.lastType) }
  })
}

function sensorMarkers(sensors: SensorLocation[], now: number) {
  return sensors.map((sensor) => ({
    location: [sensor.lat, sensor.lng] as [number, number],
    size: 0.06 * (1 + Math.sin(now / 600) * 0.15),
    color: [0.0, 1.0, 0.88] as [number, number, number],
  }))
}

function updateSvgArcs(svg: SVGSVGElement | null, arcsRef: React.MutableRefObject<GlobeArc[]>, sensors: SensorLocation[], phi: number, width: number, now: number) {
  if (!svg) return
  arcsRef.current = arcsRef.current.filter((arc) => now - arc.createdAt < 6000)
  svg.setAttribute("viewBox", `0 0 ${width} ${width}`)
  while (svg.firstChild) svg.removeChild(svg.firstChild)
  for (const sensor of sensors) appendSensorArcs(svg, sensor, arcsRef.current, phi, width, now)
}

function appendSensorArcs(svg: SVGSVGElement, sensor: SensorLocation, arcs: GlobeArc[], phi: number, width: number, now: number) {
  const dstV = latLngTo3D(sensor.lat, sensor.lng)
  const dst = projectTo2D(dstV, phi, GLOBE_THETA)
  if (!dst.visible) return
  for (const arc of arcs) appendArc(svg, arc, dstV, dst, phi, width, now)
}

function appendArc(svg: SVGSVGElement, arc: GlobeArc, dstV: [number, number, number], dst: ReturnType<typeof projectTo2D>, phi: number, width: number, now: number) {
  const srcV = latLngTo3D(arc.srcLat, arc.srcLng)
  const src = projectTo2D(srcV, phi, GLOBE_THETA)
  if (!src.visible) return
  const mid = projectTo2D(liftedMidpoint(srcV, dstV), phi, GLOBE_THETA)
  const d = arcD(src, mid, dst, width)
  const opacity = Math.max(0, 1 - (now - arc.createdAt) / 6000)
  const color = globeColorCss(arc.type)
  svg.appendChild(svgPath(d, color, 5, opacity * 0.2, "blur(3px)"))
  svg.appendChild(svgPath(d, color, 1.4, opacity * 0.9))
}

function liftedMidpoint(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = (a[2] + b[2]) / 2
  const len = Math.sqrt(mx * mx + my * my + mz * mz) || 1
  return [(mx / len) * 1.25, (my / len) * 1.25, (mz / len) * 1.25]
}

function arcD(src: ReturnType<typeof projectTo2D>, mid: ReturnType<typeof projectTo2D>, dst: ReturnType<typeof projectTo2D>, width: number) {
  return `M ${(src.x * width).toFixed(1)} ${(src.y * width).toFixed(1)} Q ${(mid.x * width).toFixed(1)} ${(mid.y * width).toFixed(1)} ${(dst.x * width).toFixed(1)} ${(dst.y * width).toFixed(1)}`
}

function svgPath(d: string, color: string, strokeWidth: number, opacity: number, filter?: string) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
  path.setAttribute("d", d); path.setAttribute("stroke", color); path.setAttribute("stroke-width", String(strokeWidth))
  path.setAttribute("fill", "none"); path.setAttribute("opacity", String(opacity))
  if (filter) path.setAttribute("filter", filter)
  return path
}

function bindPointer(canvas: HTMLCanvasElement, pointerRef: React.MutableRefObject<number | null>, movementRef: React.MutableRefObject<number>, phiRef: React.MutableRefObject<number>) {
  const onDown = (event: PointerEvent) => { pointerRef.current = event.clientX - movementRef.current; canvas.style.cursor = "grabbing" }
  const onMove = (event: PointerEvent) => { if (pointerRef.current !== null) movementRef.current = event.clientX - pointerRef.current }
  const onUp = () => releasePointer(canvas, pointerRef, movementRef, phiRef)
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove)
  canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointerout", onUp)
  return () => {
    canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove)
    canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointerout", onUp)
  }
}

function releasePointer(canvas: HTMLCanvasElement, pointerRef: React.MutableRefObject<number | null>, movementRef: React.MutableRefObject<number>, phiRef: React.MutableRefObject<number>) {
  if (pointerRef.current !== null) phiRef.current += movementRef.current
  movementRef.current = 0; pointerRef.current = null; canvas.style.cursor = "grab"
}

function cleanupGlobe(canvas: HTMLCanvasElement, destroy: () => void, rafRef: React.MutableRefObject<number>, onResize: () => void, pointerRef: React.MutableRefObject<number | null>, movementRef: React.MutableRefObject<number>, phiRef: React.MutableRefObject<number>) {
  setTimeout(() => { canvas.style.opacity = "1" }, 50)
  return () => {
    cancelAnimationFrame(rafRef.current); destroy(); window.removeEventListener("resize", onResize)
    releasePointer(canvas, pointerRef, movementRef, phiRef)
  }
}

function typeToGlobeColor(type: string): [number, number, number] {
  if (type === "ssh") return [0.13, 0.83, 0.93]
  if (type === "http") return [1.00, 0.58, 0.13]
  if (type === "ftp") return [0.98, 0.85, 0.13]
  if (type === "mysql") return [0.85, 0.32, 1.00]
  if (type === "port-scan") return [0.13, 0.93, 0.45]
  return [0.80, 0.80, 0.80]
}

function globeColorCss(type: string) {
  const [r, g, b] = typeToGlobeColor(type)
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`
}

function GlobeLegend() {
  return (
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-[#060b18]/80 px-4 py-1.5 backdrop-blur-sm">
      {["ssh", "http", "ftp", "mysql", "port-scan"].map((type) => (
        <span key={type} className="flex items-center gap-1 text-[10px] text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: globeColorCss(type) }} />
          {type}
        </span>
      ))}
    </div>
  )
}

const canvasStyle = {
  width: "100%", height: "100%", opacity: 0, transition: "opacity 1s ease",
  cursor: "grab", contain: "layout paint size", display: "block",
} as const

const svgStyle = {
  position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none",
} as const
