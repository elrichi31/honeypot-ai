"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { useLiveStream } from "@/hooks/use-live-stream"
import type { SensorHeartbeatStreamEvent } from "@/hooks/use-live-stream"

// Treat a sensor as live only while recent heartbeats keep arriving. This makes
// the UI react in near real time without relying on a full page refresh.
const LIVE_WINDOW_MS = 90_000
const PRUNE_INTERVAL_MS = 15_000

interface SensorLiveContextValue {
  isLive: (sensorId: string) => boolean
  getLastLiveAt: (sensorId: string) => number | null
}

const SensorLiveContext = createContext<SensorLiveContextValue>({
  isLive: () => false,
  getLastLiveAt: () => null,
})

export function SensorLiveProvider({ children }: { children: React.ReactNode }) {
  const liveSensors = useRef<Map<string, number>>(new Map())
  const [, bump] = useState(0)

  useLiveStream({
    onSensorHeartbeat: useCallback((event: SensorHeartbeatStreamEvent) => {
      const ts = Number.isFinite(Date.parse(event.timestamp)) ? Date.parse(event.timestamp) : Date.now()
      liveSensors.current.set(event.sensorId, ts)
      bump((n) => n + 1)
    }, []),
  })

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      let changed = false
      for (const [sensorId, ts] of liveSensors.current.entries()) {
        if (now - ts > LIVE_WINDOW_MS) {
          liveSensors.current.delete(sensorId)
          changed = true
        }
      }
      if (changed) bump((n) => n + 1)
    }, PRUNE_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [])

  const isLive = useCallback((sensorId: string) => {
    const ts = liveSensors.current.get(sensorId)
    return typeof ts === "number" && Date.now() - ts <= LIVE_WINDOW_MS
  }, [])

  const getLastLiveAt = useCallback((sensorId: string) => {
    const ts = liveSensors.current.get(sensorId)
    return typeof ts === "number" ? ts : null
  }, [])

  return (
    <SensorLiveContext.Provider value={{ isLive, getLastLiveAt }}>
      {children}
    </SensorLiveContext.Provider>
  )
}

export function useSensorLive() {
  return useContext(SensorLiveContext)
}
