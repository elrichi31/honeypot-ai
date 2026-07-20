"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type {
  AttackStreamEvent, AlertStreamEvent, SensorHeartbeatStreamEvent,
  SensorControlPresenceStreamEvent, CommandLifecycleStreamEvent,
  LiveStreamHandlers, StreamEvent,
} from "@/hooks/use-live-stream"

const CONTROL_PRESENCE_TYPES = new Set(["sensor.connected", "sensor.disconnected"])
const COMMAND_LIFECYCLE_TYPES = new Set(["command.sent", "command.acked", "command.running", "command.result"])

interface LiveStreamContextValue {
  subscribe: (handlers: LiveStreamHandlers) => () => void
  connected: boolean
}

const LiveStreamCtx = createContext<LiveStreamContextValue>({
  subscribe: () => () => {},
  connected: false,
})

export function LiveStreamProvider({ children }: { children: React.ReactNode }) {
  const handlersRef = useRef<Set<LiveStreamHandlers>>(new Set())
  const esRef = useRef<EventSource | null>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    function connect() {
      const es = new EventSource("/api/events/live")
      esRef.current = es

      es.onopen = () => {
        retryCountRef.current = 0
        setConnected(true)
      }

      es.onmessage = (msg) => {
        let event: StreamEvent
        try {
          event = JSON.parse(msg.data) as StreamEvent
        } catch {
          return
        }
        for (const h of handlersRef.current) {
          if (event.type === "alert") {
            h.onAlert?.(event as AlertStreamEvent)
          } else if (event.type === "sensor-heartbeat") {
            h.onSensorHeartbeat?.(event as SensorHeartbeatStreamEvent)
          } else if (CONTROL_PRESENCE_TYPES.has(event.type)) {
            h.onSensorControlPresence?.(event as SensorControlPresenceStreamEvent)
          } else if (COMMAND_LIFECYCLE_TYPES.has(event.type)) {
            h.onCommandLifecycle?.(event as CommandLifecycleStreamEvent)
          } else {
            h.onAttack?.(event as AttackStreamEvent)
          }
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current = null
        setConnected(false)
        // Exponential backoff with jitter: min(30s, base*2^attempt) + random(0..1s)
        const base = 1000
        const delay = Math.min(30_000, base * Math.pow(2, retryCountRef.current)) + Math.random() * 1000
        retryCountRef.current++
        retryTimerRef.current = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      esRef.current?.close()
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
    }
  }, [])

  // Stable identity so consumers' useEffect([subscribe]) doesn't re-run per render
  const subscribe = useCallback((handlers: LiveStreamHandlers) => {
    handlersRef.current.add(handlers)
    return () => { handlersRef.current.delete(handlers) }
  }, [])

  return (
    <LiveStreamCtx.Provider value={{ subscribe, connected }}>
      {children}
    </LiveStreamCtx.Provider>
  )
}

export function useLiveStreamCtx() {
  return useContext(LiveStreamCtx)
}

/** Real SSE connection status (backed by the shared EventSource), not a per-consumer guess. */
export function useLiveStreamConnected(): boolean {
  return useContext(LiveStreamCtx).connected
}
