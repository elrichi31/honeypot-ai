import { useEffect, useRef } from "react"
import type { CountryAttack } from "@/lib/types"
import { latLngTo3D, projectTo2D } from "@/lib/globe-math"

const COLLISION_DISTANCE = 42
const EDGE_PADDING = 24

interface LabelEntry {
  el: HTMLDivElement
  priority: number
  v: [number, number, number]
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("")
}

function buildLabelEl(ca: CountryAttack): HTMLDivElement {
  const dc = ca.successfulLogins > 0 ? "#ef4444" : "#7c3aed"
  const el = document.createElement("div")
  el.style.cssText = "position:absolute;pointer-events:none;transform:translate(-50%,-130%);transition:opacity 0.15s;"
  el.innerHTML = `<div style="background:rgba(10,10,20,0.82);border:1px solid rgba(255,255,255,0.12);border-radius:7px;padding:4px 8px;display:flex;align-items:center;gap:5px;backdrop-filter:blur(6px);box-shadow:0 2px 12px rgba(0,0,0,0.5);white-space:nowrap;"><span style="font-size:13px;line-height:1">${countryFlag(ca.country)}</span><span style="font-size:10px;font-weight:600;color:#fff">${ca.name}</span><span style="font-size:9px;font-weight:700;color:${dc};background:${dc}22;border-radius:4px;padding:1px 4px;">${ca.sessions.toLocaleString("en-US")}</span></div><div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid rgba(255,255,255,0.12);"></div>`
  return el
}

function hasCollision(px: number, py: number, placed: Array<{ x: number; y: number }>): boolean {
  return placed.some(({ x, y }) => {
    const dx = x - px, dy = y - py
    return Math.sqrt(dx * dx + dy * dy) < COLLISION_DISTANCE
  })
}

export function useGlobeLabels(
  containerRef: React.RefObject<HTMLDivElement | null>,
  countryAttacks: CountryAttack[],
  centroids: Record<string, [number, number]>,
) {
  const labelElemsRef = useRef<LabelEntry[]>([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.innerHTML = ""
    labelElemsRef.current = []

    const sorted = countryAttacks
      .filter((ca) => centroids[ca.country])
      .sort((a, b) => b.sessions - a.sessions)

    for (const ca of sorted) {
      const coords = centroids[ca.country]
      if (!coords) continue
      const el = buildLabelEl(ca)
      container.appendChild(el)
      labelElemsRef.current.push({ el, priority: ca.sessions, v: latLngTo3D(coords[0], coords[1]) })
    }

    return () => {
      container.innerHTML = ""
      labelElemsRef.current = []
    }
  }, [countryAttacks, containerRef, centroids])

  function updateLabels(phi: number, theta: number, width: number) {
    const placed: Array<{ x: number; y: number }> = []
    const sorted = [...labelElemsRef.current].sort((a, b) => b.priority - a.priority)

    for (const { el, v } of sorted) {
      const { x, y, visible } = projectTo2D(v, phi, theta)
      const px = x * width, py = y * width
      const inFrame =
        px > EDGE_PADDING && px < width - EDGE_PADDING &&
        py > EDGE_PADDING && py < width - EDGE_PADDING

      if (visible && inFrame && !hasCollision(px, py, placed)) {
        el.style.left = `${x * 100}%`
        el.style.top = `${y * 100}%`
        el.style.opacity = "1"
        el.style.display = "block"
        placed.push({ x: px, y: py })
      } else {
        el.style.opacity = "0"
        el.style.display = "none"
      }
    }
  }

  return { updateLabels }
}
