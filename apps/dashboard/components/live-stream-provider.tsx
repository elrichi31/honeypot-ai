"use client"

import { createContext, useCallback, useContext, useEffect, useRef } from "react"
import type { AttackStreamEvent, AlertStreamEvent, SensorHeartbeatStreamEvent, LiveStreamHandlers, StreamEvent } from "@/hooks/use-live-stream"

interface LiveStreamContextValue {
  subscribe: (handlers: LiveStreamHandlers) => () => void
}

const LiveStreamCtx = createContext<LiveStreamContextValue>({
  subscribe: () => () => {},
})

export function LiveStreamProvider({ children }: { children: React.ReactNode }) {
  const handlersRef = useRef<Set<LiveStreamHandlers>>(new Set())
  const esRef = useRef<EventSource | null>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function connect() {
      const es = new EventSource("/api/events/live")
      esRef.current = es

      es.onopen = () => {
        retryCountRef.current = 0
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
          } else {
            h.onAttack?.(event as AttackStreamEvent)
          }
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current = null
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
    <LiveStreamCtx.Provider value={{ subscribe }}>
      {children}
    </LiveStreamCtx.Provider>
  )
}

export function useLiveStreamCtx() {
  return useContext(LiveStreamCtx)
}
