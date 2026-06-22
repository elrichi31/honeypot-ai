"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLiveStream } from "@/hooks/use-live-stream"

const WINDOW_MS = 60_000

// Shows a count of attacks received in the last 60 seconds.
// Renders null until the first attack arrives so it doesn't distract when idle.
export function LiveAttackBadge() {
  const [count, setCount] = useState(0)
  const timestamps = useRef<number[]>([])

  const prune = useCallback(() => {
    const cutoff = Date.now() - WINDOW_MS
    timestamps.current = timestamps.current.filter((t) => t > cutoff)
    setCount(timestamps.current.length)
  }, [])

  useLiveStream({
    onAttack: useCallback(() => {
      timestamps.current.push(Date.now())
      prune()
    }, [prune]),
  })

  useEffect(() => {
    const id = setInterval(prune, 5_000)
    return () => clearInterval(id)
  }, [prune])

  if (count === 0) return null

  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
      {count > 99 ? "99+" : count}
    </span>
  )
}
