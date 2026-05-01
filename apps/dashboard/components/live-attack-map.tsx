"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps"

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

// ISO alpha-2 → numeric ISO 3166-1 for topojson country fill
const ISO2_NUM: Record<string, number> = {
  AF:4,AL:8,DZ:12,AS:16,AD:20,AO:24,AI:660,AQ:10,AG:28,AR:32,AM:51,AW:533,
  AU:36,AT:40,AZ:31,BS:44,BH:48,BD:50,BB:52,BY:112,BE:56,BZ:84,BJ:204,BM:60,
  BT:64,BO:68,BA:70,BW:72,BR:76,BN:96,BG:100,BF:854,BI:108,CV:132,KH:116,
  CM:120,CA:124,KY:136,CF:140,TD:148,CL:152,CN:156,CO:170,KM:174,CD:180,
  CG:178,CK:184,CR:188,CI:384,HR:191,CU:192,CY:196,CZ:203,DK:208,DJ:262,
  DM:212,DO:214,EC:218,EG:818,SV:222,GQ:226,ER:232,EE:233,SZ:748,ET:231,
  FJ:242,FI:246,FR:250,GA:266,GM:270,GE:268,DE:276,GH:288,GR:300,GL:304,
  GD:308,GT:320,GN:324,GW:624,GY:328,HT:332,HN:340,HK:344,HU:348,IS:352,
  IN:356,ID:360,IR:364,IQ:368,IE:372,IL:376,IT:380,JM:388,JP:392,JO:400,
  KZ:398,KE:404,KI:296,KP:408,KR:410,KW:414,KG:417,LA:418,LV:428,LB:422,
  LS:426,LR:430,LY:434,LI:438,LT:440,LU:442,MO:446,MG:450,MW:454,MY:458,
  MV:462,ML:466,MT:470,MH:584,MR:478,MU:480,MX:484,FM:583,MD:498,MC:492,
  MN:496,ME:499,MA:504,MZ:508,MM:104,NA:516,NP:524,NL:528,NZ:554,NI:558,
  NE:562,NG:566,NO:578,OM:512,PK:586,PW:585,PA:591,PG:598,PY:600,PE:604,
  PH:608,PL:616,PT:620,PR:630,QA:634,RO:642,RU:643,RW:646,KN:659,LC:662,
  VC:670,WS:882,SM:674,ST:678,SA:682,SN:686,RS:688,SC:690,SL:694,SG:702,
  SK:703,SI:705,SB:90,SO:706,ZA:710,SS:728,ES:724,LK:144,SD:729,SR:740,
  SE:752,CH:756,SY:760,TW:158,TJ:762,TZ:834,TH:764,TL:626,TG:768,TO:776,
  TT:780,TN:788,TR:792,TM:795,UG:800,UA:804,AE:784,GB:826,US:840,UY:858,
  UZ:860,VU:548,VE:862,VN:704,YE:887,ZM:894,ZW:716,
}

// Mirrors ComposableMap's geoMercator(scale=130, center=[10,25]) in the default 800×600 viewBox
function project(coords: [number, number], width = 800, height = 600, scale = 130, center: [number, number] = [10, 25]): [number, number] {
  const toRad = Math.PI / 180
  const [lng, lat] = coords
  const rawX = lng * toRad
  const rawY = -Math.log(Math.tan(Math.PI / 4 + lat * toRad / 2))
  const rawCX = center[0] * toRad
  const rawCY = -Math.log(Math.tan(Math.PI / 4 + center[1] * toRad / 2))
  return [
    scale * (rawX - rawCX) + width / 2,
    scale * (rawY - rawCY) + height / 2,
  ]
}

type AttackType = "ssh" | "http" | "ftp" | "mysql" | "port-scan"

const ATTACK_COLORS: Record<string, string> = {
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

function arcColor(type: string): string {
  return ATTACK_COLORS[type] ?? "#94a3b8"
}

interface SensorLocation {
  ip: string
  protocol: string
  lat: number
  lng: number
  country: string
}

interface CountryArc {
  country: string
  lat: number
  lng: number
  type: string
  count: number
}

interface LiveArc {
  id: string
  srcLng: number
  srcLat: number
  type: string
  expiresAt: number
}

interface Attack {
  id: string
  type: string
  ip: string
  lat: number
  lng: number
  country: string
  timestamp: number
  dstPort?: number
}

interface RawEvent {
  type: string
  ip: string
  lat: number
  lng: number
  country: string
  timestamp: string
  dstPort?: number
}

// SVG quadratic bezier arc between two [lng, lat] coords, projected via geoMercator
function ArcLine({
  src,
  dst,
  type,
  animated,
}: {
  src: [number, number]
  dst: [number, number]
  type: string
  animated?: boolean
}) {
  const [x1, y1] = project(src)
  const [x2, y2] = project(dst)
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 2) return null

  const offset = Math.min(len * 0.28, 55)
  const cx = (x1 + x2) / 2 - (dy / len) * offset
  const cy = (y1 + y2) / 2 + (dx / len) * offset
  const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
  const c = arcColor(type)

  if (animated) {
    return (
      <g>
        <path d={d} stroke={c} strokeWidth={3} fill="none" opacity={0.12} />
        <path d={d} stroke={c} strokeWidth={1.5} fill="none" strokeDasharray="5 4" opacity={0.9}>
          <animate attributeName="stroke-dashoffset" from="9" to="0" dur="0.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.9" to="0" dur="2.8s" fill="freeze" />
        </path>
      </g>
    )
  }

  return (
    <path d={d} stroke={c} strokeWidth={0.8} fill="none" opacity={0.2} strokeDasharray="3 6" />
  )
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export function LiveAttackMap() {
  const [sensors, setSensors] = useState<SensorLocation[]>([])
  const [countryArcs, setCountryArcs] = useState<CountryArc[]>([])
  const [attackedCodes, setAttackedCodes] = useState<Set<string>>(new Set())
  const [liveArcs, setLiveArcs] = useState<LiveArc[]>([])
  const [recent, setRecent] = useState<Attack[]>([])
  const [stats, setStats] = useState<Record<string, number>>({ ssh: 0, http: 0, ftp: 0, mysql: 0, "port-scan": 0 })
  const [connected, setConnected] = useState(false)
  const todayRef = useRef(todayUTC())
  const esRef = useRef<EventSource | null>(null)

  const loadToday = useCallback(async () => {
    try {
      const res = await fetch("/api/attacks/today")
      if (!res.ok) return
      const data = await res.json() as {
        attackedCountries: CountryArc[]
        sensors: SensorLocation[]
      }
      setSensors(data.sensors ?? [])
      setCountryArcs(data.attackedCountries ?? [])
      setAttackedCodes(new Set((data.attackedCountries ?? []).map(c => c.country)))
    } catch {
      // ignore fetch errors
    }
  }, [])

  // Reset at midnight UTC
  useEffect(() => {
    const iv = setInterval(() => {
      const now = todayUTC()
      if (now !== todayRef.current) {
        todayRef.current = now
        setCountryArcs([])
        setAttackedCodes(new Set())
        setLiveArcs([])
        setRecent([])
        setStats({ ssh: 0, http: 0, ftp: 0, mysql: 0, "port-scan": 0 })
        loadToday()
      }
    }, 60_000)
    return () => clearInterval(iv)
  }, [loadToday])

  // Clean up expired live arcs
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now()
      setLiveArcs(prev => prev.filter(a => a.expiresAt > now))
    }, 1_000)
    return () => clearInterval(iv)
  }, [])

  const addAttack = useCallback((event: RawEvent) => {
    const ts = Date.now()
    const attack: Attack = { ...event, id: crypto.randomUUID(), timestamp: ts }

    setLiveArcs(prev => [
      ...prev,
      { id: attack.id, srcLng: event.lng, srcLat: event.lat, type: event.type, expiresAt: ts + 3_000 },
    ])

    setCountryArcs(prev => {
      const key = event.country || `${event.lat},${event.lng}`
      const idx = prev.findIndex(a => a.country === key)
      if (idx === -1) return [...prev, { country: key, lat: event.lat, lng: event.lng, type: event.type, count: 1 }]
      const updated = [...prev]
      updated[idx] = { ...updated[idx], count: updated[idx].count + 1, type: event.type }
      return updated
    })

    if (event.country) {
      setAttackedCodes(prev => {
        if (prev.has(event.country)) return prev
        const next = new Set(prev)
        next.add(event.country)
        return next
      })
    }

    setRecent(prev => [attack, ...prev].slice(0, 20))
    setStats(prev => ({ ...prev, [event.type]: (prev[event.type] ?? 0) + 1 }))
  }, [])

  useEffect(() => {
    loadToday()
    const es = new EventSource("/api/events/live")
    esRef.current = es
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (e) => {
      try { addAttack(JSON.parse(e.data) as RawEvent) } catch {}
    }
    return () => es.close()
  }, [loadToday, addAttack])

  const primarySensor = sensors[0]
  const totalToday = Object.values(stats).reduce((a, b) => a + b, 0)

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-[#0a0a1a]">
      {/* Stats bar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
        {(["ssh", "http", "ftp", "mysql", "port-scan"] as AttackType[]).map(t => (
          <StatChip key={t} label={t.toUpperCase()} value={stats[t] ?? 0} chipColor={CHIP_COLORS[t]} />
        ))}
        <StatChip label="Today" value={totalToday} chipColor="text-slate-300 bg-slate-300/10 border-slate-300/30" />
        <div className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] border-border bg-background/60">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
          <span className={connected ? "text-green-400" : "text-muted-foreground"}>
            {connected ? "Live" : "Connecting..."}
          </span>
        </div>
        {attackedCodes.size > 0 && (
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-sm bg-red-500/60" />
            {attackedCodes.size} countries
          </div>
        )}
      </div>

      <ComposableMap
        projection="geoMercator"
        style={{ width: "100%", height: "100%" }}
        projectionConfig={{ scale: 130, center: [10, 25] }}
      >
        <ZoomableGroup>
          {/* Countries — red tint when attacked today */}
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const numericId = Number(geo.id)
                const attacked = [...attackedCodes].some(code => ISO2_NUM[code] === numericId)
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={attacked ? "rgba(239,68,68,0.2)" : "#111827"}
                    stroke={attacked ? "rgba(239,68,68,0.4)" : "#1e293b"}
                    strokeWidth={attacked ? 0.6 : 0.4}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: attacked ? "rgba(239,68,68,0.35)" : "#1a2535" },
                      pressed: { outline: "none" },
                    }}
                  />
                )
              })
            }
          </Geographies>

          {/* Historical arcs (one per attacked country → primary sensor) */}
          {primarySensor && countryArcs.map(arc => (
            <ArcLine
              key={`hist-${arc.country}`}
              src={[arc.lng, arc.lat]}
              dst={[primarySensor.lng, primarySensor.lat]}
              type={arc.type}
              animated={false}
            />
          ))}

          {/* Real-time animated arcs (expire after 3s) */}
          {primarySensor && liveArcs.map(arc => (
            <ArcLine
              key={arc.id}
              src={[arc.srcLng, arc.srcLat]}
              dst={[primarySensor.lng, primarySensor.lat]}
              type={arc.type}
              animated
            />
          ))}

          {/* Sensor (honeypot) destination markers */}
          {sensors.map(s => (
            <Marker key={s.ip} coordinates={[s.lng, s.lat]}>
              <title>{`Honeypot — ${s.ip} (${s.protocol})`}</title>
              <circle r={8} fill="#0ea5e9" fillOpacity={0.12} stroke="#0ea5e9" strokeWidth={1.5} />
              <circle r={3.5} fill="#0ea5e9" fillOpacity={0.9} stroke="#0f172a" strokeWidth={1} />
              <circle r={8} fill="#0ea5e9" fillOpacity={0}>
                <animate attributeName="r" from="8" to="20" dur="2.5s" repeatCount="indefinite" />
                <animate attributeName="fill-opacity" from="0.25" to="0" dur="2.5s" repeatCount="indefinite" />
              </circle>
            </Marker>
          ))}

          {/* Attack source bubbles (one per country) */}
          {countryArcs.map(arc => {
            const r = Math.min(28, 4 + Math.log2(arc.count + 1) * 3.5)
            const c = arcColor(arc.type)
            return (
              <Marker key={`dot-${arc.country}`} coordinates={[arc.lng, arc.lat]}>
                <title>{`${arc.country}: ${arc.count.toLocaleString()} attacks`}</title>
                <circle r={r} fill={c} fillOpacity={0.12} />
                <circle r={r + 2} fill={c} fillOpacity={0}>
                  <animate attributeName="r" from={`${r}`} to={`${r + 12}`} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="fill-opacity" from="0.2" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle r={Math.max(3.5, r * 0.42)} fill={c} fillOpacity={0.9} stroke="#0f172a" strokeWidth={1.5} />
                {arc.count > 1 && (
                  <text
                    y={4}
                    textAnchor="middle"
                    style={{ fill: "white", fontSize: 9, fontWeight: 700, pointerEvents: "none" }}
                  >
                    {arc.count > 999 ? "999+" : arc.count > 99 ? "99+" : arc.count}
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
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT_COLORS[a.type as AttackType] ?? "bg-slate-400"}`} />
                <span className="flex-1 truncate font-mono text-[11px] text-foreground">{a.ip}</span>
                <span className="text-[10px] text-muted-foreground">{a.country || "??"}</span>
                <span className={`rounded px-1 text-[9px] font-bold uppercase ${BADGE_COLORS[a.type as AttackType] ?? "bg-slate-400/20 text-slate-400"}`}>
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

function StatChip({ label, value, chipColor }: { label: string; value: number; chipColor: string }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${chipColor}`}>
      <span className="text-current/60">{label}</span>
      <span className="font-bold">{value.toLocaleString()}</span>
    </div>
  )
}
