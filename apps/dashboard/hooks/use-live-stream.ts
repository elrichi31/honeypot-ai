"use client"

import { useEffect, useRef } from "react"
import { useLiveStreamCtx } from "@/components/live-stream-provider"

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

export function useLiveStream(handlers: LiveStreamHandlers) {
  const { subscribe } = useLiveStreamCtx()
  // Keep handlers in a ref so subscribe doesn't re-run on every render
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    return subscribe({
      onAttack: (e) => handlersRef.current.onAttack?.(e),
      onAlert: (e) => handlersRef.current.onAlert?.(e),
      onSensorHeartbeat: (e) => handlersRef.current.onSensorHeartbeat?.(e),
    })
  }, [subscribe])
}
