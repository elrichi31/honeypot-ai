"use client"

import { useEffect, useRef } from "react"
import createGlobe from "cobe"

// Decorative spinning globe for the login panel. Unlike LiveAttackGlobe this
// carries no live data — just ambient rotation with a few scattered markers.
export function LoginGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phiRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let width = canvas.offsetWidth
    const onResize = () => { width = canvas.offsetWidth }
    window.addEventListener("resize", onResize)

    const globe = createGlobe(canvas, {
      devicePixelRatio: Math.min(window.devicePixelRatio, 2),
      width: width * 2, height: width * 2,
      phi: 0, theta: 0.28, dark: 1, diffuse: 3, mapSamples: 16000, mapBrightness: 1.6,
      baseColor: [0.25, 0.28, 0.45], markerColor: [1, 0.3, 0.35], glowColor: [0.18, 0.15, 0.28],
      markers: MARKERS,
    })

    let raf = 0
    const render = () => {
      phiRef.current += 0.004
      globe.update({ phi: phiRef.current, width: width * 2, height: width * 2 })
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    setTimeout(() => { canvas.style.opacity = "1" }, 50)

    return () => {
      cancelAnimationFrame(raf)
      globe.destroy()
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return (
    <div className="relative aspect-square w-full max-w-[520px]">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", opacity: 0, transition: "opacity 1s ease", contain: "layout paint size", display: "block" }}
      />
    </div>
  )
}

const MARKERS: { location: [number, number]; size: number }[] = [
  { location: [37.77, -122.41], size: 0.05 }, // San Francisco
  { location: [40.71, -74.0], size: 0.06 },   // New York
  { location: [51.5, -0.12], size: 0.05 },     // London
  { location: [52.52, 13.4], size: 0.04 },     // Berlin
  { location: [55.75, 37.61], size: 0.05 },    // Moscow
  { location: [39.9, 116.4], size: 0.06 },     // Beijing
  { location: [1.35, 103.81], size: 0.05 },    // Singapore
  { location: [-23.55, -46.63], size: 0.05 },  // São Paulo
  { location: [19.43, -99.13], size: 0.04 },   // Mexico City
  { location: [28.61, 77.2], size: 0.05 },     // Delhi
]
