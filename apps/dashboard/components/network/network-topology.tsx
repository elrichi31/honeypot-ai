"use client"

import { useState, useRef, useEffect, useMemo, useCallback, forwardRef } from "react"
import {
  Globe, Server, Lock, Network, Database,
  ArrowLeft, WifiOff, HardDrive, Radio,
} from "lucide-react"
import type { Sensor } from "@/lib/api"

// ─── Protocol meta (mirrors sensor-card) ─────────────────────────────────────
const PROTOCOL_META: Record<string, {
  label: string
  icon: React.ElementType
  color: string
  bg: string
  border: string
  glow: string
}> = {
  ssh:         { label: "SSH",       icon: Server,    color: "text-cyan-400",   bg: "bg-cyan-400/10",   border: "border-cyan-400/30",   glow: "rgb(34 211 238 / 0.4)"   },
  ftp:         { label: "FTP",       icon: HardDrive, color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/30", glow: "rgb(250 204 21 / 0.4)"   },
  mysql:       { label: "MySQL",     icon: Database,  color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/30", glow: "rgb(192 132 252 / 0.4)"  },
  "port-scan": { label: "Port Scan", icon: Radio,     color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/30",   glow: "rgb(96 165 250 / 0.4)"   },
  http:        { label: "HTTP",      icon: Globe,     color: "text-green-400",  bg: "bg-green-400/10",  border: "border-green-400/30",  glow: "rgb(74 222 128 / 0.4)"   },
  dionaea:     { label: "Dionaea",   icon: Network,   color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/30",    glow: "rgb(248 113 113 / 0.4)"  },
  smb:         { label: "SMB",       icon: Server,    color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/30", glow: "rgb(251 146 60 / 0.4)"   },
  mssql:       { label: "MSSQL",     icon: Database,  color: "text-pink-400",   bg: "bg-pink-400/10",   border: "border-pink-400/30",   glow: "rgb(244 114 182 / 0.4)"  },
  rpc:         { label: "RPC",       icon: Network,   color: "text-indigo-400", bg: "bg-indigo-400/10", border: "border-indigo-400/30", glow: "rgb(129 140 248 / 0.4)"  },
  tftp:        { label: "TFTP",      icon: Server,    color: "text-lime-400",   bg: "bg-lime-400/10",   border: "border-lime-400/30",   glow: "rgb(163 230 53 / 0.4)"   },
  mqtt:        { label: "MQTT",      icon: Network,   color: "text-teal-400",   bg: "bg-teal-400/10",   border: "border-teal-400/30",   glow: "rgb(45 212 191 / 0.4)"   },
  deception:   { label: "Deception", icon: Lock,      color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/30", glow: "rgb(167 139 250 / 0.4)"  },
}

function getMeta(protocol: string) {
  return PROTOCOL_META[protocol] ?? {
    label: protocol, icon: Server,
    color: "text-slate-400", bg: "bg-slate-400/10",
    border: "border-slate-400/30", glow: "rgb(148 163 184 / 0.4)",
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "-") return false
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return false
  const [a, b] = v4.split(".").map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

type Group = {
  key: string
  name: string
  slug: string | null
  external: Sensor[]
  internal: Sensor[]
}

function buildGroups(sensors: Sensor[]): Group[] {
  const map = new Map<string, Group>()
  for (const s of sensors) {
    const key = s.clientId ?? "__unassigned__"
    if (!map.has(key)) {
      map.set(key, { key, name: s.clientName ?? "Sin cliente", slug: s.clientSlug, external: [], internal: [] })
    }
    const g = map.get(key)!
    if (isPrivateIp(s.ip)) g.internal.push(s)
    else g.external.push(s)
  }
  return Array.from(map.values()).sort((a, b) =>
    a.key === "__unassigned__" ? 1 : b.key === "__unassigned__" ? -1 : a.name.localeCompare(b.name)
  )
}

// ─── SVG line layer ───────────────────────────────────────────────────────────
type LineCoord = { x1: number; y1: number; x2: number; y2: number; accent?: boolean }

function LineLayer({ lines, w, h }: { lines: LineCoord[]; w: number; h: number }) {
  if (!w || !h || lines.length === 0) return null
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={w} height={h}
      style={{ zIndex: 0 }}
    >
      <defs>
        <filter id="glow-a">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {lines.map((l, i) => {
        const color = l.accent ? "rgb(139 92 246 / 0.5)" : "rgb(34 211 238 / 0.45)"
        const dash = l.accent ? "rgb(139 92 246 / 0.15)" : "rgb(34 211 238 / 0.12)"
        return (
          <g key={i}>
            <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke={dash} strokeWidth="1" strokeDasharray="6 4" />
            <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke={color} strokeWidth="1.5" filter="url(#glow-a)" />
          </g>
        )
      })}
    </svg>
  )
}

// ─── Protocol pill (compact label) ───────────────────────────────────────────
function ProtocolPill({ sensor }: { sensor: Sensor }) {
  const meta = getMeta(sensor.protocol)
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${meta.bg} ${meta.color}`}>
      <Icon className="h-2.5 w-2.5" />
      {meta.label}
      {sensor.online && (
        <span className="ml-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      )}
    </span>
  )
}

// ─── Client card (global view) ────────────────────────────────────────────────
const ClientCard = forwardRef<HTMLDivElement, { group: Group; onClick: () => void }>(
  ({ group, onClick }, ref) => {
    const onlineCount = [...group.external, ...group.internal].filter(s => s.online).length
    const total = group.external.length + group.internal.length
    return (
      <div
        ref={ref}
        onClick={onClick}
        className="cursor-pointer rounded-xl border border-border bg-card hover:border-cyan-400/40 hover:bg-cyan-400/5 transition-all p-4 space-y-3 select-none"
        style={{ zIndex: 1, position: "relative" }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate leading-tight">{group.name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {onlineCount}/{total} online
            </p>
          </div>
          <div className="shrink-0 flex gap-2 text-[10px]">
            {group.external.length > 0 && (
              <span className="text-cyan-400 font-mono">{group.external.length}↑</span>
            )}
            {group.internal.length > 0 && (
              <span className="text-violet-400 font-mono">{group.internal.length}⬡</span>
            )}
          </div>
        </div>

        {group.external.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Internet-facing</p>
            <div className="flex flex-wrap gap-1">
              {group.external.map(s => <ProtocolPill key={s.sensorId} sensor={s} />)}
            </div>
          </div>
        )}

        {group.internal.length > 0 && (
          <div className="rounded-lg border border-violet-400/20 bg-violet-400/5 p-2 space-y-1.5">
            <p className="text-[9px] uppercase tracking-widest text-violet-400/70">Red Interna</p>
            <div className="flex flex-wrap gap-1">
              {group.internal.map(s => <ProtocolPill key={s.sensorId} sensor={s} />)}
            </div>
          </div>
        )}
      </div>
    )
  }
)
ClientCard.displayName = "ClientCard"

// ─── Sensor detail card (client detail view) ──────────────────────────────────
const SensorDetailCard = forwardRef<HTMLDivElement, { sensor: Sensor }>(({ sensor }, ref) => {
  const meta = getMeta(sensor.protocol)
  const Icon = meta.icon
  return (
    <div
      ref={ref}
      className={`rounded-xl border ${meta.border} ${meta.bg} p-3 w-36 shrink-0`}
      style={{ zIndex: 1, position: "relative" }}
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.bg} mb-2`}>
        <Icon className={`h-4 w-4 ${meta.color}`} />
      </div>
      <p className="font-semibold text-xs text-foreground leading-tight truncate">{sensor.name}</p>
      <p className={`text-[10px] font-medium ${meta.color}`}>{meta.label}</p>
      <p className="font-mono text-[9px] text-muted-foreground mt-0.5 truncate">{sensor.ip || "-"}</p>
      <div className="flex items-center gap-1 mt-2">
        {sensor.online ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[9px] text-emerald-400">Online</span>
          </>
        ) : (
          <>
            <WifiOff className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground">Offline</span>
          </>
        )}
      </div>
      <p className="text-[9px] text-muted-foreground mt-0.5">{sensor.eventsTotal.toLocaleString()} events</p>
    </div>
  )
})
SensorDetailCard.displayName = "SensorDetailCard"

// ─── Global view ──────────────────────────────────────────────────────────────
function GlobalView({ groups, onSelect }: { groups: Group[]; onSelect: (key: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const internetRef = useRef<HTMLDivElement>(null)
  const clientRefs = useRef<(HTMLDivElement | null)[]>([])
  const [lines, setLines] = useState<LineCoord[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  const computeLines = useCallback(() => {
    if (!containerRef.current || !internetRef.current) return
    const cont = containerRef.current.getBoundingClientRect()
    const inet = internetRef.current.getBoundingClientRect()
    setSize({ w: cont.width, h: cont.height })
    const next: LineCoord[] = []
    clientRefs.current.forEach((ref) => {
      if (!ref) return
      const r = ref.getBoundingClientRect()
      next.push({
        x1: inet.left + inet.width / 2 - cont.left,
        y1: inet.bottom - cont.top,
        x2: r.left + r.width / 2 - cont.left,
        y2: r.top - cont.top,
      })
    })
    setLines(next)
  }, [])

  useEffect(() => {
    requestAnimationFrame(computeLines)
    const obs = new ResizeObserver(() => requestAnimationFrame(computeLines))
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [computeLines, groups])

  const cols = Math.min(groups.length, 4)

  return (
    <div ref={containerRef} className="relative w-full p-8 pb-12">
      <LineLayer lines={lines} w={size.w} h={size.h} />

      {/* Internet node */}
      <div className="relative flex justify-center mb-14" style={{ zIndex: 1 }}>
        <div
          ref={internetRef}
          className="flex items-center gap-3 rounded-2xl border border-cyan-400/30 bg-cyan-400/5 px-6 py-3 shadow-[0_0_24px_rgb(34_211_238_/_0.12)]"
        >
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/10">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/10" />
            <Globe className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Internet</p>
            <p className="text-[10px] text-cyan-400/70">External attack surface</p>
          </div>
          <div className="ml-4 text-right">
            <p className="text-lg font-semibold text-foreground">
              {groups.reduce((s, g) => s + g.external.length, 0)}
            </p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">exposed</p>
          </div>
        </div>
      </div>

      {/* Client grid */}
      <div
        className="relative grid gap-5 mx-auto"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(200px, 260px))`,
          justifyContent: "center",
        }}
      >
        {groups.map((group, i) => (
          <ClientCard
            key={group.key}
            group={group}
            ref={(el) => { clientRefs.current[i] = el }}
            onClick={() => onSelect(group.key)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="relative mt-8 flex items-center justify-center gap-6 text-[10px] text-muted-foreground" style={{ zIndex: 1 }}>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-cyan-400/50" />
          Expuesto a Internet
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Online
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
          Offline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-violet-400/40 bg-violet-400/10" />
          Red interna
        </span>
      </div>
    </div>
  )
}

// ─── Client detail view ────────────────────────────────────────────────────────
function ClientDetailView({ group, onBack }: { group: Group; onBack: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const internetRef = useRef<HTMLDivElement>(null)
  const externalRefs = useRef<(HTMLDivElement | null)[]>([])
  const internalRef = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<LineCoord[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  const computeLines = useCallback(() => {
    if (!containerRef.current || !internetRef.current) return
    const cont = containerRef.current.getBoundingClientRect()
    const inet = internetRef.current.getBoundingClientRect()
    setSize({ w: cont.width, h: cont.height })
    const next: LineCoord[] = []

    // Internet → each external sensor
    externalRefs.current.forEach((ref) => {
      if (!ref) return
      const r = ref.getBoundingClientRect()
      next.push({
        x1: inet.left + inet.width / 2 - cont.left,
        y1: inet.bottom - cont.top,
        x2: r.left + r.width / 2 - cont.left,
        y2: r.top - cont.top,
      })
    })

    // External sensors (or internet if none) → internal network box
    if (internalRef.current) {
      const intRect = internalRef.current.getBoundingClientRect()
      const sources = externalRefs.current.filter(Boolean)
      if (sources.length > 0) {
        sources.forEach((ref) => {
          const r = ref!.getBoundingClientRect()
          next.push({
            x1: r.left + r.width / 2 - cont.left,
            y1: r.bottom - cont.top,
            x2: intRect.left + intRect.width / 2 - cont.left,
            y2: intRect.top - cont.top,
            accent: true,
          })
        })
      } else {
        // No external sensors — connect internet directly to internal network
        next.push({
          x1: inet.left + inet.width / 2 - cont.left,
          y1: inet.bottom - cont.top,
          x2: intRect.left + intRect.width / 2 - cont.left,
          y2: intRect.top - cont.top,
          accent: true,
        })
      }
    }

    setLines(next)
  }, [])

  useEffect(() => {
    requestAnimationFrame(computeLines)
    const obs = new ResizeObserver(() => requestAnimationFrame(computeLines))
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [computeLines, group])

  const totalEvents = [...group.external, ...group.internal].reduce((s, x) => s + x.eventsTotal, 0)
  const onlineCount = [...group.external, ...group.internal].filter(s => s.online).length

  return (
    <div ref={containerRef} className="relative w-full p-8 pb-12">
      <LineLayer lines={lines} w={size.w} h={size.h} />

      {/* Header row */}
      <div className="relative flex items-center gap-4 mb-10" style={{ zIndex: 1 }}>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-cyan-400/30 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Global
        </button>
        <div>
          <h2 className="font-semibold text-foreground">{group.name}</h2>
          <p className="text-[10px] text-muted-foreground">
            {onlineCount} online · {totalEvents.toLocaleString()} events
          </p>
        </div>
      </div>

      {/* Internet node */}
      <div className="relative flex justify-center mb-12" style={{ zIndex: 1 }}>
        <div
          ref={internetRef}
          className="flex items-center gap-3 rounded-2xl border border-cyan-400/30 bg-cyan-400/5 px-6 py-3 shadow-[0_0_24px_rgb(34_211_238_/_0.12)]"
        >
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/10">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/10" />
            <Globe className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Internet</p>
            <p className="text-[10px] text-cyan-400/70">External attack surface</p>
          </div>
        </div>
      </div>

      {/* External sensors row */}
      {group.external.length > 0 && (
        <div className="relative mb-12" style={{ zIndex: 1 }}>
          <p className="text-center text-[9px] uppercase tracking-widest text-muted-foreground mb-4">
            Internet-facing sensors
          </p>
          <div className="flex justify-center flex-wrap gap-4">
            {group.external.map((s, i) => (
              <SensorDetailCard
                key={s.sensorId}
                sensor={s}
                ref={(el) => { externalRefs.current[i] = el }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty external zone label (so we still have a target for lines when no ext sensors) */}
      {group.external.length === 0 && group.internal.length > 0 && (
        <div className="flex justify-center mb-10">
          <p className="text-[10px] text-muted-foreground/50 italic">Sin exposición directa a Internet</p>
        </div>
      )}

      {/* Internal network */}
      {group.internal.length > 0 && (
        <div
          ref={internalRef}
          className="relative mx-auto max-w-2xl rounded-xl border border-violet-400/30 bg-violet-400/5 p-5 shadow-[0_0_32px_rgb(139_92_246_/_0.08)]"
          style={{ zIndex: 1 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-violet-400" />
              <p className="text-[10px] uppercase tracking-widest text-violet-400 font-medium">
                Red Interna / Deception Network
              </p>
            </div>
            <span className="text-[9px] text-violet-400/60 font-mono">10.0.0.0/24</span>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            {group.internal.map(s => (
              <SensorDetailCard key={s.sensorId} sensor={s} />
            ))}
          </div>
        </div>
      )}

      {/* No internal sensors note */}
      {group.internal.length === 0 && group.external.length > 0 && (
        <div className="relative flex justify-center mt-4" style={{ zIndex: 1 }}>
          <p className="text-[10px] text-muted-foreground/50 italic">Sin red interna configurada</p>
        </div>
      )}
    </div>
  )
}

// ─── Stats bar ────────────────────────────────────────────────────────────────
function StatsBar({ groups }: { groups: Group[] }) {
  const allSensors = groups.flatMap(g => [...g.external, ...g.internal])
  const external = groups.reduce((s, g) => s + g.external.length, 0)
  const internal = groups.reduce((s, g) => s + g.internal.length, 0)
  const online = allSensors.filter(s => s.online).length
  const events = allSensors.reduce((s, x) => s + x.eventsTotal, 0)

  return (
    <div className="flex items-center gap-px border-b border-border bg-muted/20">
      {[
        { label: "Clientes", value: groups.length, color: "text-foreground" },
        { label: "Ext", value: external, color: "text-cyan-400" },
        { label: "Int", value: internal, color: "text-violet-400" },
        { label: "Online", value: online, color: "text-emerald-400" },
        { label: "Events", value: events.toLocaleString(), color: "text-foreground" },
      ].map(({ label, value, color }) => (
        <div key={label} className="flex-1 px-4 py-2.5 text-center border-r border-border last:border-r-0">
          <p className={`text-base font-semibold ${color}`}>{value}</p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────
export function NetworkTopology({ sensors }: { sensors: Sensor[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const groups = useMemo(() => buildGroups(sensors), [sensors])

  if (sensors.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card flex flex-col items-center justify-center py-24 text-center">
        <Network className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">No hay sensores registrados</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Los sensores aparecen aquí automáticamente al iniciar. Agrupa sensores por cliente para ver la topología por cliente.
        </p>
      </div>
    )
  }

  const selectedGroup = selected ? groups.find(g => g.key === selected) : null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <StatsBar groups={groups} />

      {/* Dot grid background */}
      <div
        className="relative overflow-auto"
        style={{
          backgroundImage: "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {selectedGroup ? (
          <ClientDetailView
            group={selectedGroup}
            onBack={() => setSelected(null)}
          />
        ) : (
          <GlobalView
            groups={groups}
            onSelect={setSelected}
          />
        )}
      </div>
    </div>
  )
}
