import { useState, useRef, useEffect, useCallback } from "react"
import type { RefObject } from "react"
import type { Transform } from "./types"
import { CANVAS_W, CANVAS_H } from "./constants"

const MIN_SCALE = 0.15
const MAX_SCALE = 5

export function useCanvasTransform(viewportRef: RefObject<HTMLDivElement | null>) {
  const [xform, _setXform] = useState<Transform>({ x: 0, y: 0, scale: 1 })

  // Kept in sync so wheel/pan callbacks always read the latest value without
  // re-registering event listeners every render.
  const xformRef = useRef(xform)
  function setXform(t: Transform) {
    xformRef.current = t
    _setXform(t)
  }

  // ─── Fit ────────────────────────────────────────────────────────────────────
  const fitTransform = useCallback((w: number, h: number): Transform => {
    const scale = Math.min((w - 32) / CANVAS_W, (h - 32) / CANVAS_H, 1)
    return { scale, x: (w - CANVAS_W * scale) / 2, y: (h - CANVAS_H * scale) / 2 }
  }, [])

  function fit(w: number, h: number) {
    setXform(fitTransform(w, h))
  }

  // ─── Zoom ───────────────────────────────────────────────────────────────────
  function zoom(factor: number, cx?: number, cy?: number) {
    const t = xformRef.current
    const pivotX = cx ?? (viewportRef.current ? viewportRef.current.clientWidth  / 2 : 0)
    const pivotY = cy ?? (viewportRef.current ? viewportRef.current.clientHeight / 2 : 0)
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor))
    setXform({
      scale: newScale,
      x: pivotX - (pivotX - t.x) * (newScale / t.scale),
      y: pivotY - (pivotY - t.y) * (newScale / t.scale),
    })
  }

  // ─── Wheel (non-passive so we can preventDefault) ────────────────────────────
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect   = el.getBoundingClientRect()
      const cx     = e.clientX - rect.left
      const cy     = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.12 : 0.9
      const t      = xformRef.current
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor))
      setXform({
        scale: newScale,
        x: cx - (cx - t.x) * (newScale / t.scale),
        y: cy - (cy - t.y) * (newScale / t.scale),
      })
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [viewportRef])

  // ─── Pan ─────────────────────────────────────────────────────────────────────
  const isPanning  = useRef(false)
  const panOrigin  = useRef({ mx: 0, my: 0, tx: 0, ty: 0 })
  const didPan     = useRef(false)

  const panHandlers = {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0) return
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      isPanning.current = true
      didPan.current    = false
      panOrigin.current = { mx: e.clientX, my: e.clientY, tx: xformRef.current.x, ty: xformRef.current.y }
    },
    onPointerMove(e: React.PointerEvent) {
      if (!isPanning.current) return
      const dx = e.clientX - panOrigin.current.mx
      const dy = e.clientY - panOrigin.current.my
      if (Math.abs(dx) + Math.abs(dy) > 4) didPan.current = true
      setXform({ ...xformRef.current, x: panOrigin.current.tx + dx, y: panOrigin.current.ty + dy })
    },
    onPointerUp(e: React.PointerEvent) {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      isPanning.current = false
    },
  }

  return {
    xform,
    fitTransform,
    fit,
    zoom,
    panHandlers,
    getDidPan:   () => didPan.current,
    clearDidPan: () => { didPan.current = false },
  }
}
