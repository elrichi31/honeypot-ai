"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type React from "react"
import { useLiveStream } from "@/hooks/use-live-stream"
import type { AttackStreamEvent } from "@/hooks/use-live-stream"
import { useLiveStreamConnected } from "@/components/live-stream-provider"
import { LiveAttackControls } from "@/components/live-attack-controls"
import { LiveAttackGlobe } from "@/components/live-attack-globe"
import { LiveAttackMap2D } from "@/components/live-attack-map-2d"
import { CountryHoverTooltip, RecentAttacksSidebar } from "@/components/live-attack-sidebar"
import type {
  Attack,
  CountryHit,
  GlobeArc,
  HoverCountry,
  LiveArc,
  LiveMarkerEntry,
  RawEvent,
  SensorLocation,
  ViewMode,
} from "@/components/live-attack-map-types"

const EMPTY_STATS = { ssh: 0, http: 0, ftp: 0, mysql: 0, "port-scan": 0 }

function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}

export function LiveAttackMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const liveMarkersRef = useRef<Map<string, LiveMarkerEntry>>(new Map())
  const globeArcsRef = useRef<GlobeArc[]>([])
  const todayRef = useRef(todayUTC())
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>("2d")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [sensors, setSensors] = useState<SensorLocation[]>([])
  const [countryHits, setCountryHits] = useState<CountryHit[]>([])
  const [attackedCodes, setAttackedCodes] = useState<Set<string>>(new Set())
  const [liveArcs, setLiveArcs] = useState<LiveArc[]>([])
  const [recent, setRecent] = useState<Attack[]>([])
  const [stats, setStats] = useState<Record<string, number>>(EMPTY_STATS)
  const connected = useLiveStreamConnected()
  const [hoverCountry, setHoverCountry] = useState<HoverCountry | null>(null)

  const loadToday = useCallback(async () => {
    try {
      const res = await fetch("/api/attacks/today", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as { attackedCountries: CountryHit[]; sensors: SensorLocation[] }
      applyTodayData(data, setSensors, setCountryHits, setAttackedCodes, liveMarkersRef)
    } catch {
      return
    }
  }, [])

  // Heartbeat-triggered refresh: only reconcile sensor markers (a sensor came
  // online/offline). Must NOT call applyTodayData here — that would overwrite
  // countryHits/liveMarkersRef with the 10-min-cached server snapshot, wiping
  // out attacks accumulated live since the last full load.
  const refreshSensors = useCallback(async () => {
    try {
      const res = await fetch("/api/attacks/today", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as { sensors: SensorLocation[] }
      setSensors(data.sensors ?? [])
    } catch {
      return
    }
  }, [])

  const addAttack = useCallback((event: RawEvent) => {
    const timestamp = Date.now()
    addLiveArc(event, timestamp, setLiveArcs)
    updateCountryHits(event, setCountryHits, setAttackedCodes)
    setRecent((prev) => [{ ...event, id: crypto.randomUUID(), timestamp }, ...prev].slice(0, 25))
    setStats((prev) => ({ ...prev, [event.type]: (prev[event.type] ?? 0) + 1 }))
    updateGlobeMarker(event, timestamp, liveMarkersRef)
    globeArcsRef.current.push(globeArc(event, timestamp))
  }, [])

  useFullscreenListener(setIsFullscreen)
  useLiveEvents(loadToday, refreshSensors, addAttack, refreshTimerRef)
  useDayRollover(todayRef, loadToday, resetLiveState)
  useArcExpiry(setLiveArcs)
  useSensorRefreshCleanup(refreshTimerRef)

  function resetLiveState() {
    setCountryHits([])
    setAttackedCodes(new Set())
    setLiveArcs([])
    setRecent([])
    setStats(EMPTY_STATS)
    liveMarkersRef.current.clear()
    globeArcsRef.current = []
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen()
    else document.exitFullscreen()
  }

  const total24h = countryHits.reduce((sum, hit) => sum + hit.count, 0)
  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-xl border border-white/5 bg-[#060b18] [&:fullscreen]:rounded-none">
      <LiveAttackControls
        stats={stats}
        total24h={total24h}
        countryCount={attackedCodes.size}
        connected={connected}
        viewMode={viewMode}
        isFullscreen={isFullscreen}
        setViewMode={setViewMode}
        toggleFullscreen={toggleFullscreen}
      />
      <CountryHoverTooltip hoverCountry={hoverCountry} visible={viewMode === "2d"} />
      <LiveAttackMap2D
        visible={viewMode === "2d"}
        sensors={sensors}
        countryHits={countryHits}
        liveArcs={liveArcs}
        setHoverCountry={setHoverCountry}
      />
      <LiveAttackGlobe
        visible={viewMode === "3d"}
        sensors={sensors}
        liveMarkersRef={liveMarkersRef}
        globeArcsRef={globeArcsRef}
      />
      <RecentAttacksSidebar recent={recent} />
    </div>
  )
}

function useFullscreenListener(setIsFullscreen: (value: boolean) => void) {
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [setIsFullscreen])
}

function useLiveEvents(
  loadToday: () => Promise<void>,
  refreshSensors: () => Promise<void>,
  addAttack: (event: RawEvent) => void,
  refreshTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  useEffect(() => {
    loadToday()
  }, [loadToday])

  const scheduleSensorRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) return
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      void refreshSensors()
    }, 1500)
  }, [refreshSensors, refreshTimerRef])

  useLiveStream({
    onAttack: useCallback((event: AttackStreamEvent) => {
      addAttack(event as RawEvent)
    }, [addAttack]),
    onSensorHeartbeat: scheduleSensorRefresh,
  })
}

function useDayRollover(todayRef: React.MutableRefObject<string>, loadToday: () => Promise<void>, resetLiveState: () => void) {
  useEffect(() => {
    const interval = setInterval(() => {
      const now = todayUTC()
      if (now === todayRef.current) return
      todayRef.current = now
      resetLiveState()
      loadToday()
    }, 60_000)
    return () => clearInterval(interval)
  }, [todayRef, loadToday, resetLiveState])
}

function useArcExpiry(setLiveArcs: React.Dispatch<React.SetStateAction<LiveArc[]>>) {
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setLiveArcs((prev) => prev.filter((arc) => arc.expiresAt > now))
    }, 500)
    return () => clearInterval(interval)
  }, [setLiveArcs])
}

function useSensorRefreshCleanup(refreshTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  useEffect(() => () => {
    if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current)
  }, [refreshTimerRef])
}

function applyTodayData(
  data: { attackedCountries: CountryHit[]; sensors: SensorLocation[] },
  setSensors: (sensors: SensorLocation[]) => void,
  setCountryHits: (hits: CountryHit[]) => void,
  setAttackedCodes: (codes: Set<string>) => void,
  liveMarkersRef: React.MutableRefObject<Map<string, LiveMarkerEntry>>,
) {
  const attackedCountries = data.attackedCountries ?? []
  setSensors(data.sensors ?? [])
  setCountryHits(attackedCountries)
  setAttackedCodes(new Set(attackedCountries.map((country) => country.country)))
  liveMarkersRef.current.clear()
  for (const hit of attackedCountries) {
    liveMarkersRef.current.set(hit.country, {
      lat: hit.lat,
      lng: hit.lng,
      count: hit.count,
      lastHitAt: 0,
      lastType: hit.type,
    })
  }
}

function addLiveArc(event: RawEvent, timestamp: number, setLiveArcs: React.Dispatch<React.SetStateAction<LiveArc[]>>) {
  setLiveArcs((prev) => [
    ...prev,
    {
      id: crypto.randomUUID(),
      srcLng: event.lng,
      srcLat: event.lat,
      type: event.type,
      dstPort: event.dstPort,
      targetSensorId: event.sensorId ?? null,
      expiresAt: timestamp + 5_000,
    },
  ])
}

function updateCountryHits(
  event: RawEvent,
  setCountryHits: React.Dispatch<React.SetStateAction<CountryHit[]>>,
  setAttackedCodes: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  setCountryHits((prev) => nextCountryHits(prev, event))
  if (!event.country) return
  setAttackedCodes((prev) => prev.has(event.country) ? prev : new Set(prev).add(event.country))
}

function nextCountryHits(prev: CountryHit[], event: RawEvent) {
  const key = event.country || `${event.lat},${event.lng}`
  const index = prev.findIndex((country) => country.country === key)
  if (index === -1) return [...prev, { country: key, lat: event.lat, lng: event.lng, type: event.type, count: 1 }]
  const next = [...prev]
  next[index] = { ...next[index], count: next[index].count + 1, type: event.type }
  return next
}

function updateGlobeMarker(event: RawEvent, timestamp: number, liveMarkersRef: React.MutableRefObject<Map<string, LiveMarkerEntry>>) {
  const key = event.country || `${Math.round(event.lat)},${Math.round(event.lng)}`
  const existing = liveMarkersRef.current.get(key)
  liveMarkersRef.current.set(key, {
    lat: event.lat,
    lng: event.lng,
    count: (existing?.count ?? 0) + 1,
    lastHitAt: timestamp,
    lastType: event.type,
  })
}

function globeArc(event: RawEvent, timestamp: number): GlobeArc {
  return {
    id: crypto.randomUUID(),
    srcLat: event.lat,
    srcLng: event.lng,
    type: event.type,
    dstPort: event.dstPort,
    targetSensorId: event.sensorId ?? null,
    createdAt: timestamp,
  }
}
