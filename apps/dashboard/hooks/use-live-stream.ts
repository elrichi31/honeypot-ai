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
  sensorId?: string | null
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

export interface SensorControlPresenceStreamEvent {
  type: "sensor.connected" | "sensor.disconnected"
  sensorId: string
  connectionId: string
  timestamp: string
}

// Mirrors ingest-api's CommandSentEvent/CommandAckedEvent/CommandRunningEvent/
// CommandResultEvent (event-bus.ts) — only IDs/status ever cross this
// unauthenticated broadcast, never the command result payload itself.
export interface CommandLifecycleStreamEvent {
  type: "command.sent" | "command.acked" | "command.running" | "command.result"
  commandId: string
  sensorId: string
  timestamp: string
}

export type StreamEvent =
  | AttackStreamEvent
  | AlertStreamEvent
  | SensorHeartbeatStreamEvent
  | SensorControlPresenceStreamEvent
  | CommandLifecycleStreamEvent

export interface LiveStreamHandlers {
  onAttack?: (event: AttackStreamEvent) => void
  onAlert?: (event: AlertStreamEvent) => void
  onSensorHeartbeat?: (event: SensorHeartbeatStreamEvent) => void
  onSensorControlPresence?: (event: SensorControlPresenceStreamEvent) => void
  onCommandLifecycle?: (event: CommandLifecycleStreamEvent) => void
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
      onSensorControlPresence: (e) => handlersRef.current.onSensorControlPresence?.(e),
      onCommandLifecycle: (e) => handlersRef.current.onCommandLifecycle?.(e),
    })
  }, [subscribe])
}
