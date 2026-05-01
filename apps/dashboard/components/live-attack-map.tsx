"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps"

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

// ISO alpha-2 → numeric ISO 3166-1 for topojson country fill matching
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

// Same projection params as ComposableMap (800×600 viewBox, geoMercator scale=130, center=[10,25])
function project(coords: [number, number]): [number, number] {
  const [lng, lat] = coords
  const toRad = Math.PI / 180
  const scale = 130; const w = 800; const h = 600
  const cLng = 10; const cLat = 25
  const rawX = lng * toRad
  const rawY = -Math.log(Math.tan(Math.PI / 4 + lat * toRad / 2))
  const rawCX = cLng * toRad
  const rawCY = -Math.log(Math.tan(Math.PI / 4 + cLat * toRad / 2))
  return [scale * (rawX - rawCX) + w / 2, scale * (rawY - rawCY) + h / 2]
}

const TYPE_COLOR: Record<string, string> = {
  ssh:        "#f43f5e",  // rose
  http:       "#fb923c",  // orange
  ftp:        "#facc15",  // yellow
  mysql:      "#c084fc",  // purple
  "port-scan":"#38bdf8",  // sky blue
}

function typeColor(type: string) { return TYPE_COLOR[type] ?? "#94a3b8" }

type AttackType = "ssh" | "http" | "ftp" | "mysql" | "port-scan"

const CHIP_COLORS: Record<AttackType, string> = {
  ssh:        "text-rose-400 border-rose-500/40 bg-rose-500/10",
  http:       "text-orange-400 border-orange-500/40 bg-orange-500/10",
  ftp:        "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  mysql:      "text-purple-400 border-purple-500/40 bg-purple-500/10",
  "port-scan":"text-sky-400 border-sky-500/40 bg-sky-500/10",
}

const DOT_CLS: Record<string, string> = {
  ssh: "bg-rose-400", http: "bg-orange-400", ftp: "bg-yellow-400",
  mysql: "bg-purple-400", "port-scan": "bg-sky-400",
}

interface SensorLocation { ip: string; protocol: string; lat: number; lng: number; country: string }
interface CountryHit     { country: string; lat: number; lng: number; type: string; count: number }
interface LiveArc        { id: string; srcLng: number; srcLat: number; type: string; expiresAt: number }
interface Attack         { id: string; type: string; ip: string; lat: number; lng: number; country: string; timestamp: number; dstPort?: number }
interface RawEvent       { type: string; ip: string; lat: number; lng: number; country: string; timestamp: string; dstPort?: number }

// Quadratic bezier arc d-string from [lng,lat] → [lng,lat]
function arcPath(src: [number, number], dst: [number, number]): string | null {
  const [x1, y1] = project(src)
  const [x2, y2] = project(dst)
  const dx = x2 - x1; const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 3) return null
  const off = Math.min(len * 0.28, 60)
  const cx = (x1 + x2) / 2 - (dy / len) * off
  const cy = (y1 + y2) / 2 + (dx / len) * off
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

// Faint historical arc — shows today's attack pattern as thin dim lines
function HistArc({ src, dst, type }: { src: [number, number]; dst: [number, number]; type: string }) {
  const d = arcPath(src, dst)
  if (!d) return null
  const c = typeColor(type)
  return <path d={d} stroke={c} strokeWidth={0.6} fill="none" opacity={0.18} />
}

// Animated "comet" arc — bright bullet that travels from attacker to honeypot, then fades
function LiveArcLine({ src, dst, type }: { src: [number, number]; dst: [number, number]; type: string }) {
  const d = arcPath(src, dst)
  if (!d) return null
  const c = typeColor(type)
  // strokeDasharray: 8px bullet, 700px gap (covers any arc length in 800×600 viewBox)
  // Animate dashoffset from 8 → -700: bullet travels start-to-end in 1.8s, then fades
  return (
    <g>
      {/* Base track */}
      <path d={d} stroke={c} strokeWidth={0.7} fill="none" opacity={0.25} />
      {/* Glowing halo around the traveling bullet */}
      <path
        d={d}
        stroke={c}
        strokeWidth={5}
        fill="none"
        strokeDasharray="8 700"
        filter="url(#arc-glow)"
        opacity={0}
      >
        <animate attributeName="stroke-dashoffset" from="8" to="-700" dur="1.8s" fill="freeze" />
        <animate attributeName="opacity" from="0.35" to="0" begin="0s" dur="1.8s" fill="freeze" calcMode="spline"
          keyTimes="0;0.6;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" values="0;0.35;0" />
      </path>
      {/* Sharp bright bullet */}
      <path
        d={d}
        stroke={c}
        strokeWidth={1.8}
        fill="none"
        strokeDasharray="8 700"
        opacity={0}
      >
        <animate attributeName="stroke-dashoffset" from="8" to="-700" dur="1.8s" fill="freeze" />
        <animate attributeName="opacity" from="0.95" to="0" begin="0s" dur="1.8s" fill="freeze" calcMode="spline"
          keyTimes="0;0.7;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" values="0;0.95;0" />
      </path>
    </g>
  )
}

function todayUTC() { return new Date().toISOString().slice(0, 10) }

export function LiveAttackMap() {
  const [sensors,       setSensors]       = useState<SensorLocation[]>([])
  const [countryHits,   setCountryHits]   = useState<CountryHit[]>([])
  const [attackedCodes, setAttackedCodes] = useState<Set<string>>(new Set())
  const [liveArcs,      setLiveArcs]      = useState<LiveArc[]>([])
  const [recent,        setRecent]        = useState<Attack[]>([])
  const [stats,         setStats]         = useState<Record<string, number>>({ ssh:0, http:0, ftp:0, mysql:0, "port-scan":0 })
  const [connected,     setConnected]     = useState(false)
  const todayRef = useRef(todayUTC())

  const loadToday = useCallback(async () => {
    try {
      const res = await fetch("/api/attacks/today")
      if (!res.ok) return
      const data = await res.json() as { attackedCountries: CountryHit[]; sensors: SensorLocation[] }
      setSensors(data.sensors ?? [])
      setCountryHits(data.attackedCountries ?? [])
      setAttackedCodes(new Set((data.attackedCountries ?? []).map(c => c.country)))
    } catch { /* ignore */ }
  }, [])

  // Midnight reset
  useEffect(() => {
    const iv = setInterval(() => {
      const now = todayUTC()
      if (now !== todayRef.current) {
        todayRef.current = now
        setCountryHits([])
        setAttackedCodes(new Set())
        setLiveArcs([])
        setRecent([])
        setStats({ ssh:0, http:0, ftp:0, mysql:0, "port-scan":0 })
        loadToday()
      }
    }, 60_000)
    return () => clearInterval(iv)
  }, [loadToday])

  // Expire live arcs
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now()
      setLiveArcs(prev => prev.filter(a => a.expiresAt > now))
    }, 500)
    return () => clearInterval(iv)
  }, [])

  const addAttack = useCallback((ev: RawEvent) => {
    const ts = Date.now()
    setLiveArcs(prev => [...prev, { id: crypto.randomUUID(), srcLng: ev.lng, srcLat: ev.lat, type: ev.type, expiresAt: ts + 2_500 }])
    setCountryHits(prev => {
      const key = ev.country || `${ev.lat},${ev.lng}`
      const idx = prev.findIndex(c => c.country === key)
      if (idx === -1) return [...prev, { country: key, lat: ev.lat, lng: ev.lng, type: ev.type, count: 1 }]
      const next = [...prev]
      next[idx] = { ...next[idx], count: next[idx].count + 1, type: ev.type }
      return next
    })
    if (ev.country) setAttackedCodes(prev => { if (prev.has(ev.country)) return prev; const s = new Set(prev); s.add(ev.country); return s })
    setRecent(prev => [{ ...ev, id: crypto.randomUUID(), timestamp: ts }, ...prev].slice(0, 25))
    setStats(prev => ({ ...prev, [ev.type]: (prev[ev.type] ?? 0) + 1 }))
  }, [])

  useEffect(() => {
    loadToday()
    const es = new EventSource("/api/events/live")
    es.onopen  = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (e) => { try { addAttack(JSON.parse(e.data) as RawEvent) } catch {} }
    return () => es.close()
  }, [loadToday, addAttack])

  const primary = sensors[0]
  const totalToday = Object.values(stats).reduce((a, b) => a + b, 0)

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/5 bg-[#060b18]">

      {/* ── Top-left stats ── */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {(Object.keys(CHIP_COLORS) as AttackType[]).map(t => (
            <div key={t} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium tracking-wide ${CHIP_COLORS[t]}`}>
              <span className="opacity-60 uppercase">{t}</span>
              <span className="font-bold">{(stats[t] ?? 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-slate-300">
            <span className="opacity-60">Today</span>
            <span className="font-bold">{totalToday.toLocaleString()}</span>
          </div>
          {attackedCodes.size > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-slate-400">
              <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ background: "#f43f5e88" }} />
              {attackedCodes.size} countries
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px]">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            <span className={connected ? "text-emerald-400" : "text-slate-500"}>{connected ? "Live" : "Offline"}</span>
          </div>
        </div>
      </div>

      {/* ── Map ── */}
      <ComposableMap
        projection="geoMercator"
        style={{ width: "100%", height: "100%" }}
        projectionConfig={{ scale: 130, center: [10, 25] }}
      >
        {/* SVG filter for neon glow — must be sibling to ZoomableGroup inside the SVG */}
        <defs>
          <filter id="arc-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="dot-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <ZoomableGroup>
          {/* Countries */}
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const id = Number(geo.id)
                const hit = [...attackedCodes].some(c => ISO2_NUM[c] === id)
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={hit ? "rgba(244,63,94,0.18)" : "#0d1526"}
                    stroke={hit ? "rgba(244,63,94,0.5)" : "#1a2540"}
                    strokeWidth={hit ? 0.5 : 0.3}
                    style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }}
                  />
                )
              })
            }
          </Geographies>

          {/* Historical arcs — faint dim lines showing today's pattern */}
          {primary && countryHits.map(h => (
            <HistArc key={`h-${h.country}`} src={[h.lng, h.lat]} dst={[primary.lng, primary.lat]} type={h.type} />
          ))}

          {/* Live animated comet arcs */}
          {primary && liveArcs.map(a => (
            <LiveArcLine key={a.id} src={[a.srcLng, a.srcLat]} dst={[primary.lng, primary.lat]} type={a.type} />
          ))}

          {/* Honeypot destination — pulsing cyan ring */}
          {sensors.map(s => (
            <Marker key={s.ip} coordinates={[s.lng, s.lat]}>
              <title>{`Honeypot ${s.ip}`}</title>
              {/* Outer pulsing ring */}
              <circle r={0} fill="none" stroke="#22d3ee" strokeWidth={1.2} opacity={0}>
                <animate attributeName="r" from="6" to="22" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.6" to="0" dur="2.4s" repeatCount="indefinite" />
              </circle>
              {/* Solid core */}
              <circle r={4.5} fill="#22d3ee" opacity={0.9} filter="url(#dot-glow)" />
              <circle r={2} fill="#fff" opacity={0.9} />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* ── Recent attacks panel ── */}
      <div className="absolute right-4 top-4 z-20 w-56 rounded-xl border border-white/8 bg-[#0a1020]/85 backdrop-blur-sm overflow-hidden">
        <div className="px-3 py-2 border-b border-white/8">
          <p className="text-[11px] font-semibold text-slate-300 tracking-wide uppercase">Recent Attacks</p>
        </div>
        {recent.length === 0 ? (
          <p className="px-3 py-5 text-[11px] text-slate-500 text-center">Waiting for events…</p>
        ) : (
          <div className="divide-y divide-white/5 max-h-[65vh] overflow-y-auto">
            {recent.map(a => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT_CLS[a.type] ?? "bg-slate-400"}`} />
                <span className="flex-1 truncate font-mono text-[10px] text-slate-200">{a.ip}</span>
                <span className="text-[9px] text-slate-500 flex-shrink-0">{a.country || "??"}</span>
                <span
                  className="rounded px-1 py-0.5 text-[8px] font-bold uppercase flex-shrink-0"
                  style={{ color: typeColor(a.type), background: typeColor(a.type) + "22" }}
                >
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
