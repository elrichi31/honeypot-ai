import { useRef } from "react"

interface GlobePointerState {
  phiRef: React.MutableRefObject<number>
  movementRef: React.MutableRefObject<number>
  isDraggingRef: React.MutableRefObject<boolean>
  attachTo: (canvas: HTMLCanvasElement) => () => void
}

export function useGlobePointer(initialPhi = 0): GlobePointerState {
  const phiRef = useRef(initialPhi)
  const movementRef = useRef(0)
  const anchorRef = useRef<number | null>(null)
  const isDraggingRef = useRef(false)

  const onPointerDown = (e: PointerEvent) => {
    anchorRef.current = e.clientX - movementRef.current
    isDraggingRef.current = true
    ;(e.target as HTMLCanvasElement).style.cursor = "grabbing"
  }

  const onPointerMove = (e: PointerEvent) => {
    if (anchorRef.current === null) return
    movementRef.current = e.clientX - anchorRef.current
  }

  const onPointerUp = (e: PointerEvent) => {
    if (anchorRef.current === null) return
    phiRef.current += movementRef.current
    movementRef.current = 0
    anchorRef.current = null
    isDraggingRef.current = false
    ;(e.target as HTMLCanvasElement).style.cursor = "grab"
  }

  const attachTo = (canvas: HTMLCanvasElement) => {
    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointerout", onPointerUp)
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointerout", onPointerUp)
    }
  }

  return { phiRef, movementRef, isDraggingRef, attachTo }
}
