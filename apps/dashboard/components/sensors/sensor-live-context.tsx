"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
import { useLiveStream } from "@/hooks/use-live-stream"
import type { SensorHeartbeatStreamEvent } from "@/hooks/use-live-stream"

// Tracks which sensorIds have sent a heartbeat in the current session.
// Once a sensor is seen as live it stays "live" for the page lifetime —
// it means the sensor is actively talking to the ingest API.
interface SensorLiveContextValue {
  isLive: (sensorId: string) => boolean
}

const SensorLiveContext = createContext<SensorLiveContextValue>({ isLive: () => false })

export function SensorLiveProvider({ children }: { children: React.ReactNode }) {
  const liveSensors = useRef<Set<string>>(new Set())
  const [, bump] = useState(0)

  useLiveStream({
    onSensorHeartbeat: useCallback((event: SensorHeartbeatStreamEvent) => {
      if (!liveSensors.current.has(event.sensorId)) {
        liveSensors.current.add(event.sensorId)
        bump((n) => n + 1)
      }
    }, []),
  })

  const isLive = useCallback((sensorId: string) => liveSensors.current.has(sensorId), [])

  return (
    <SensorLiveContext.Provider value={{ isLive }}>
      {children}
    </SensorLiveContext.Provider>
  )
}

export function useSensorLive() {
  return useContext(SensorLiveContext)
}
