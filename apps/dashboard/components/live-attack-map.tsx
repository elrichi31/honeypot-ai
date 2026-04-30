"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps"

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

type AttackType = "ssh" | "http" | "ftp" | "mysql" | "port-scan"

const ATTACK_COLORS: Record<AttackType, string> = {
  ssh: "#ef4444",
  http: "#f97316",
  ftp: "#eab308",
  mysql: "#a855f7",
  "port-scan": "#3b82f6",
}

const CHIP_COLORS: Record<AttackType, string> = {
  ssh: "text-red-400 bg-red-400/10 border-red-400/30",
  http: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  ftp: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  mysql: "text-purple-400 bg-purple-400/10 border-purple-400/30",
  "port-scan": "text-blue-400 bg-blue-400/10 border-blue-400/30",
}

const DOT_COLORS: Record<AttackType, string> = {
  ssh: "bg-red-400",
  http: "bg-orange-400",
  ftp: "bg-yellow-400",
  mysql: "bg-purple-400",
  "port-scan": "bg-blue-400",
}

const BADGE_COLORS: Record<AttackType, string> = {
  ssh: "bg-red-400/20 text-red-400",
  http: "bg-orange-400/20 text-orange-400",
  ftp: "bg-yellow-400/20 text-yellow-400",
  mysql: "bg-purple-400/20 text-purple-400",
  "port-scan": "bg-blue-400/20 text-blue-400",
}

interface Attack {
  id: string
  type: AttackType
  ip: string
  lat: number
  lng: number
  country: string
  timestamp: number
  dstPort?: number
}

interface CountryAttack {
  id: string
  lat: number
  lng: number
  country: string
  count: number
  lastType: AttackType
  lastSeen: number
  types: Record<AttackType, number>
}

interface RawEvent {
  type: AttackType
  ip: string
  lat: number
  lng: number
  country: string
  timestamp: string
  dstPort?: number
}

export function LiveAttackMap() {
  const [attacks, setAttacks] = useState<CountryAttack[]>([])
  const [recent, setRecent] = useState<Attack[]>([])
  const [stats, setStats] = useState<Record<AttackType, number>>({ ssh: 0, http: 0, ftp: 0, mysql: 0, "port-scan": 0 })
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  const addAttack = useCallback((event: RawEvent) => {
    const timestamp = Date.now()
    const attack: Attack = {
      ...event,
      id: crypto.randomUUID(),
      timestamp,
    }
    const key = event.country || `${event.lat.toFixed(2)},${event.lng.toFixed(2)}`
    setAttacks(prev => {
      const existing = prev.find(a => a.id === key)
      if (!existing) {
        return [
          ...prev,
          {
            id: key,
            lat: event.lat,
            lng: event.lng,
            country: event.country || "Unknown",
            count: 1,
            lastType: event.type,
            lastSeen: timestamp,
            types: { ssh: 0, http: 0, ftp: 0, mysql: 0, "port-scan": 0, [event.type]: 1 },
          },
        ]
      }

      return prev.map(a => {
        if (a.id !== key) return a
        return {
          ...a,
          lat: event.lat,
          lng: event.lng,
          count: a.count + 1,
          lastType: event.type,
          lastSeen: timestamp,
          types: { ...a.types, [event.type]: (a.types[event.type] ?? 0) + 1 },
        }
      })
    })
    setRecent(prev => [attack, ...prev].slice(0, 20))
    setStats(prev => ({ ...prev, [event.type]: (prev[event.type] ?? 0) + 1 }))
  }, [])

  useEffect(() => {
    const es = new EventSource("/api/events/live")
    esRef.current = es
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (e) => {
      try { addAttack(JSON.parse(e.data) as RawEvent) } catch {}
    }
    return () => es.close()
  }, [addAttack])

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-[#0a0a1a]">
      {/* Top stats bar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
        {(Object.keys(CHIP_COLORS) as AttackType[]).map(t => (
          <StatChip key={t} label={t.toUpperCase()} value={stats[t]} color={CHIP_COLORS[t]} />
        ))}
        <StatChip label="Total" value={Object.values(stats).reduce((a, b) => a + b, 0)} color="text-slate-300 bg-slate-300/10 border-slate-300/30" />
        <div className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] border-border bg-background/60">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
          <span className={connected ? "text-green-400" : "text-muted-foreground"}>
            {connected ? "Live" : "Connecting..."}
          </span>
        </div>
      </div>

      {/* Map */}
      <ComposableMap
        projection="geoMercator"
        style={{ width: "100%", height: "100%" }}
        projectionConfig={{ scale: 130, center: [10, 25] }}
      >
        <ZoomableGroup>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#111827"
                  stroke="#1e293b"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "#1a2535" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {attacks.map(attack => {
            const radius = Math.min(30, 4 + Math.log2(attack.count + 1) * 4)
            const color = ATTACK_COLORS[attack.lastType] ?? "#94a3b8"
            return (
              <Marker key={attack.id} coordinates={[attack.lng, attack.lat]}>
                <title>{`${attack.country}: ${attack.count.toLocaleString()} attacks`}</title>
                <circle r={radius} fill={color} fillOpacity={0.2} />
                <circle r={radius + 2} fill={color} fillOpacity={0}>
                  <animate attributeName="r" from={`${radius}`} to={`${radius + 16}`} dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="fill-opacity" from="0.28" to="0" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle r={Math.max(4, radius * 0.45)} fill={color} fillOpacity={0.9} stroke="#0f172a" strokeWidth={1.5} />
                {attack.count > 1 && (
                  <text
                    y={4}
                    textAnchor="middle"
                    className="fill-white text-[10px] font-bold"
                    style={{ pointerEvents: "none" }}
                  >
                    {attack.count > 99 ? "99+" : attack.count}
                  </text>
                )}
              </Marker>
            )
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* Recent attacks panel */}
      <div className="absolute right-3 top-3 z-10 w-60 max-h-[70vh] overflow-auto rounded-xl border border-border bg-background/80 backdrop-blur-sm">
        <div className="px-3 py-2 border-b border-border">
          <p className="text-xs font-semibold text-foreground">Recent attacks</p>
        </div>
        {recent.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">Waiting for attacks...</p>
        ) : (
          <div className="divide-y divide-border/40">
            {recent.map(a => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT_COLORS[a.type] ?? "bg-slate-400"}`} />
                <span className="flex-1 truncate font-mono text-[11px] text-foreground">{a.ip}</span>
                <span className="text-[10px] text-muted-foreground">{a.country || "??"}</span>
                <span className={`rounded px-1 text-[9px] font-bold uppercase ${BADGE_COLORS[a.type] ?? "bg-slate-400/20 text-slate-400"}`}>
                  {a.dstPort ? `${a.type}:${a.dstPort}` : a.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${color}`}>
      <span className="text-current/60">{label}</span>
      <span className="font-bold">{value.toLocaleString()}</span>
    </div>
  )
}
