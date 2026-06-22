"use client"

import { useEffect, useRef } from "react"

export interface AttackStreamEvent {
  type: string
  ip: string
  lat: number
  lng: number
  country: string
  timestamp: string
  dstPort?: number
}

export interface AlertStreamEvent {
  type: "alert"
  level: string
  title: string
  srcIp: string | null
  sensorId: string | null
  timestamp: string
}

export interface SensorHeartbeatStreamEvent {
  type: "sensor-heartbeat"
  sensorId: string
  timestamp: string
}

export type StreamEvent = AttackStreamEvent | AlertStreamEvent | SensorHeartbeatStreamEvent

export interface LiveStreamHandlers {
  onAttack?: (event: AttackStreamEvent) => void
  onAlert?: (event: AlertStreamEvent) => void
  onSensorHeartbeat?: (event: SensorHeartbeatStreamEvent) => void
}

// Shared SSE consumer. Opens one connection per component that mounts it.
// The live attack map has its own EventSource — this hook is for sidebar/alerts
// features that don't need the full map state.
export function useLiveStream(handlers: LiveStreamHandlers) {
  // Keep handlers in a ref so the effect doesn't re-run on every render
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const es = new EventSource("/api/events/live")

    es.onmessage = (msg) => {
      let event: StreamEvent
      try {
        event = JSON.parse(msg.data) as StreamEvent
      } catch {
        return
      }

      if (event.type === "alert") {
        handlersRef.current.onAlert?.(event as AlertStreamEvent)
      } else if (event.type === "sensor-heartbeat") {
        handlersRef.current.onSensorHeartbeat?.(event as SensorHeartbeatStreamEvent)
      } else {
        handlersRef.current.onAttack?.(event as AttackStreamEvent)
      }
    }

    return () => es.close()
  }, [])
}
