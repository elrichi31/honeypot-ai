"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import {
  Globe, Server, Lock, Database, Network,
  HardDrive, Radio, WifiOff, ArrowLeft,
} from "lucide-react"
import type { Sensor } from "@/lib/api"

// ─── Protocol meta ────────────────────────────────────────────────────────────
const PROTOCOL_META: Record<string, {
  label: string; icon: React.ElementType
  color: string; bg: string; border: string; glow: string
}> = {
  ssh:         { label: "SSH",       icon: Server,    color: "text-cyan-400",   bg: "bg-cyan-400/10",   border: "border-cyan-400/40",   glow: "34,211,238"   },
  ftp:         { label: "FTP",       icon: HardDrive, color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/40", glow: "250,204,21"   },
  mysql:       { label: "MySQL",     icon: Database,  color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/40", glow: "192,132,252"  },
  "port-scan": { label: "Port Scan", icon: Radio,     color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/40",   glow: "96,165,250"   },
  http:        { label: "HTTP",      icon: Globe,     color: "text-green-400",  bg: "bg-green-400/10",  border: "border-green-400/40",  glow: "74,222,128"   },
  dionaea:     { label: "Dionaea",   icon: Network,   color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/40",    glow: "248,113,113"  },
  smb:         { label: "SMB",       icon: Server,    color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/40", glow: "251,146,60"   },
  mssql:       { label: "MSSQL",     icon: Database,  color: "text-pink-400",   bg: "bg-pink-400/10",   border: "border-pink-400/40",   glow: "244,114,182"  },
  rpc:         { label: "RPC",       icon: Network,   color: "text-indigo-400", bg: "bg-indigo-400/10", border: "border-indigo-400/40", glow: "129,140,248"  },
  tftp:        { label: "TFTP",      icon: Server,    color: "text-lime-400",   bg: "bg-lime-400/10",   border: "border-lime-400/40",   glow: "163,230,53"   },
  mqtt:        { label: "MQTT",      icon: Network,   color: "text-teal-400",   bg: "bg-teal-400/10",   border: "border-teal-400/40",   glow: "45,212,191"   },
  deception:   { label: "Deception", icon: Lock,      color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/40", glow: "167,139,250"  },
}
function getMeta(p: string) {
  return PROTOCOL_META[p] ?? { label: p, icon: Server, color: "text-slate-400", bg: "bg-slate-400/10", border: "border-slate-400/40", glow: "148,163,184" }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "-") return false
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return false
  const [a, b] = v4.split(".").map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

type Group = { key: string; name: string; slug: string | null; external: Sensor[]; internal: Sensor[] }

function buildGroups(sensors: Sensor[]): Group[] {
  const map = new Map<string, Group>()
  for (const s of sensors) {
    const key = s.clientId ?? "__unassigned__"
    if (!map.has(key)) map.set(key, { key, name: s.clientName ?? "Sin cliente", slug: s.clientSlug, external: [], internal: [] })
    const g = map.get(key)!
    if (isPrivateIp(s.ip)) g.internal.push(s)
    else g.external.push(s)
  }
  return Array.from(map.values()).sort((a, b) =>
    a.key === "__unassigned__" ? 1 : b.key === "__unassigned__" ? -1 : a.name.localeCompare(b.name)
  )
}

// ─── Layout engine ────────────────────────────────────────────────────────────
const NODE_W = 100
const NODE_H = 90
const BASE_STEP = NODE_W + 16  // 116
const CLIENT_GAP = 48
const EXT_Y = 230
const INT_Y = 420
const INET_Y = 70
const CANVAS_MIN_H = 560

type SensorNode = { sensor: Sensor; x: number; y: number; clientKey: string }
type Cluster = {
  key: string; name: string; cx: number
  extX1: number; extX2: number
  intX1: number; intX2: number
  hasInt: boolean
}

function computeLayout(groups: Group[], W: number) {
  if (W < 10) return null

  // Compute how much width each cluster needs (based on external sensors)
  const rawWidths = groups.map(g => Math.max(1, g.external.length) * BASE_STEP)
  const rawTotal = rawWidths.reduce((s, w) => s + w, 0) + Math.max(0, groups.length - 1) * CLIENT_GAP
  const scale = rawTotal > W - 48 ? (W - 48) / rawTotal : 1
  const STEP = BASE_STEP * scale
  const CGAP = CLIENT_GAP * scale

  const extNodes: SensorNode[] = []
  const intNodes: SensorNode[] = []
  const clusters: Cluster[] = []

  let cursor = 24
  groups.forEach((group, gi) => {
    const cw = Math.max(1, group.external.length) * STEP
    const cs = cursor
    const cx = cs + cw / 2

    group.external.forEach((s, i) => {
          extNodes.push({ sensor: s, x: cs + i * STEP + STEP / 2, y: EXT_Y, clientKey: group.key })
    })

    const intCount = group.internal.length
    const intW = Math.max(1, intCount) * STEP
    const iStart = cx - intW / 2
    group.internal.forEach((s, i) => {
      intNodes.push({ sensor: s, x: iStart + i * STEP + STEP / 2, y: INT_Y, clientKey: group.key })
    })

    clusters.push({
      key: group.key, name: group.name, cx,
      extX1: cs - 8, extX2: cs + cw + 8,
      intX1: cx - intW / 2 - 8, intX2: cx + intW / 2 + 8,
      hasInt: intCount > 0,
    })

    cursor += cw + CGAP
  })

  const internet = { x: W / 2, y: INET_Y }
  return { internet, extNodes, intNodes, clusters }
}

// ─── Bezier path helper ───────────────────────────────────────────────────────
function bez(x1: number, y1: number, x2: number, y2: number) {
  const d = Math.abs(y2 - y1) * 0.55
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${(y1+d).toFixed(1)}, ${x2.toFixed(1)} ${(y2-d).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

// ─── SVG lines layer ──────────────────────────────────────────────────────────
function Lines({
  layout,
  W,
  H,
  selectedId,
}: {
  layout: NonNullable<ReturnType<typeof computeLayout>>
  W: number
  H: number
  selectedId: string | null
}) {
  const { internet, extNodes, intNodes } = layout

  const selectedClientKey = selectedId
    ? (extNodes.find(n => n.sensor.sensorId === selectedId) ?? intNodes.find(n => n.sensor.sensorId === selectedId))?.clientKey ?? null
    : null

  function lineOpacity(clientKey: string) {
    if (!selectedId) return 1
    return clientKey === selectedClientKey ? 1 : 0.1
  }

  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible" width={W} height={H} style={{ zIndex: 1 }}>
      <defs>
        <filter id="glow-line">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-line-soft">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Internet → external sensors */}
      {extNodes.map((n) => {
        const op = lineOpacity(n.clientKey)
        const p = bez(internet.x, internet.y + NODE_H / 2, n.x, n.y - NODE_H / 2)
        return (
          <g key={n.sensor.sensorId} style={{ opacity: op, transition: "opacity 0.25s" }}>
            <path d={p} fill="none" stroke="rgb(34,211,238)" strokeWidth="0.8" strokeDasharray="5 4" strokeOpacity="0.25" />
            <path d={p} fill="none" stroke="rgb(34,211,238)" strokeWidth="1.5" strokeOpacity="0.6" filter="url(#glow-line)" />
          </g>
        )
      })}

      {/* Internet → internal sensors (when no external in same client) */}
      {layout.clusters.map((cl) => {
        if (cl.hasInt) return null
        const clientIntNodes = intNodes.filter(n => n.clientKey === cl.key)
        return clientIntNodes.map((n) => {
          const op = lineOpacity(n.clientKey)
          const p = bez(internet.x, internet.y + NODE_H / 2, n.x, n.y - NODE_H / 2)
          return (
            <g key={n.sensor.sensorId} style={{ opacity: op, transition: "opacity 0.25s" }}>
              <path d={p} fill="none" stroke="rgb(139,92,246)" strokeWidth="0.8" strokeDasharray="5 4" strokeOpacity="0.2" />
              <path d={p} fill="none" stroke="rgb(139,92,246)" strokeWidth="1.5" strokeOpacity="0.5" filter="url(#glow-line)" />
            </g>
          )
        })
      })}

      {/* External → internal (same client) */}
      {extNodes.map((extN) => {
        const clientIntNodes = intNodes.filter(n => n.clientKey === extN.clientKey)
        return clientIntNodes.map((intN) => {
          const op = lineOpacity(extN.clientKey)
          const p = bez(extN.x, extN.y + NODE_H / 2, intN.x, intN.y - NODE_H / 2)
          return (
            <g key={`${extN.sensor.sensorId}-${intN.sensor.sensorId}`} style={{ opacity: op, transition: "opacity 0.25s" }}>
              <path d={p} fill="none" stroke="rgb(139,92,246)" strokeWidth="0.8" strokeDasharray="4 4" strokeOpacity="0.2" />
              <path d={p} fill="none" stroke="rgb(139,92,246)" strokeWidth="1.3" strokeOpacity="0.45" filter="url(#glow-line-soft)" />
            </g>
          )
        })
      })}
    </svg>
  )
}

// ─── Single sensor node card ──────────────────────────────────────────────────
function SensorNodeCard({
  node,
  selected,
  onClick,
}: {
  node: SensorNode
  selected: boolean
  onClick: () => void
}) {
  const meta = getMeta(node.sensor.protocol)
  const Icon = meta.icon
  const glowColor = `rgb(${meta.glow}/0.5)`

  return (
    <div
      onClick={onClick}
      className={`absolute cursor-pointer rounded-xl border bg-card transition-all duration-200 p-2.5 select-none hover:scale-105 ${
        selected ? meta.border : "border-border/60 hover:border-border"
      }`}
      style={{
        left: node.x - NODE_W / 2,
        top: node.y - NODE_H / 2,
        width: NODE_W,
        height: NODE_H,
        zIndex: 2,
        boxShadow: selected ? `0 0 18px 2px ${glowColor}, 0 0 6px 1px ${glowColor}` : undefined,
        transform: selected ? "scale(1.05)" : undefined,
      }}
    >
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${meta.bg} mb-1.5`}>
        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
      </div>
      <p className={`text-[9px] font-bold uppercase tracking-wider ${meta.color} leading-none`}>{meta.label}</p>
      <p className="text-[9px] text-foreground font-medium leading-tight truncate mt-0.5">{node.sensor.name}</p>
      <p className="font-mono text-[8px] text-muted-foreground truncate">{node.sensor.ip || "-"}</p>
      <div className="flex items-center gap-1 mt-1">
        {node.sensor.online ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[8px] text-emerald-400">Online</span>
          </>
        ) : (
          <>
            <WifiOff className="h-2 w-2 text-muted-foreground/40" />
            <span className="text-[8px] text-muted-foreground/50">Offline</span>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Internet node ────────────────────────────────────────────────────────────
function InternetNode({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="absolute flex items-center gap-3 rounded-2xl border border-cyan-400/30 bg-cyan-400/5 px-5 py-2.5 shadow-[0_0_32px_rgb(34,211,238,0.15)]"
      style={{ left: x - 90, top: y - 22, width: 180, height: 44, zIndex: 3 }}
    >
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/10">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/10" />
        <Globe className="h-4 w-4 text-cyan-400" />
      </div>
      <div>
        <p className="text-xs font-semibold text-foreground leading-none">Internet</p>
        <p className="text-[9px] text-cyan-400/70 mt-0.5">Attack surface</p>
      </div>
    </div>
  )
}

// ─── Cluster background & label ───────────────────────────────────────────────
function ClusterOverlay({
  cluster,
  selected,
  onSelect,
}: {
  cluster: Cluster
  selected: boolean
  onSelect: () => void
}) {
  const PAD_Y = 14
  const EXT_TOP = EXT_Y - NODE_H / 2 - PAD_Y
  const EXT_H = NODE_H + PAD_Y * 2

  return (
    <>
      {/* External zone background */}
      <div
        className={`absolute rounded-xl border transition-colors ${
          selected ? "border-cyan-400/20 bg-cyan-400/5" : "border-border/30 bg-transparent"
        }`}
        style={{
          left: cluster.extX1,
          top: EXT_TOP,
          width: cluster.extX2 - cluster.extX1,
          height: EXT_H,
          zIndex: 0,
        }}
      />

      {/* Internal zone background */}
      {cluster.hasInt && (
        <div
          className={`absolute rounded-xl border transition-colors ${
            selected ? "border-violet-400/25 bg-violet-400/8" : "border-violet-400/15 bg-violet-400/5"
          }`}
          style={{
            left: cluster.intX1,
            top: INT_Y - NODE_H / 2 - PAD_Y,
            width: cluster.intX2 - cluster.intX1,
            height: NODE_H + PAD_Y * 2,
            zIndex: 0,
          }}
        />
      )}

      {/* Client label */}
      <button
        onClick={onSelect}
        className={`absolute text-[9px] font-semibold uppercase tracking-widest transition-colors ${
          selected ? "text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
        }`}
        style={{
          left: cluster.cx - 60,
          top: EXT_TOP - 20,
          width: 120,
          textAlign: "center",
          zIndex: 2,
        }}
      >
        {cluster.name}
      </button>

      {/* Internal zone label */}
      {cluster.hasInt && (
        <div
          className="absolute flex items-center gap-1"
          style={{
            left: cluster.intX1 + 8,
            top: INT_Y - NODE_H / 2 - PAD_Y + 4,
            zIndex: 3,
          }}
        >
          <Lock className="h-2.5 w-2.5 text-violet-400/60" />
          <span className="text-[8px] uppercase tracking-widest text-violet-400/60">Red Interna</span>
        </div>
      )}
    </>
  )
}

// ─── Detail panel (selected sensor) ──────────────────────────────────────────
function SensorPanel({ sensor, onClose }: { sensor: Sensor; onClose: () => void }) {
  const meta = getMeta(sensor.protocol)
  const Icon = meta.icon
  return (
    <div className="absolute right-4 top-4 bottom-4 w-52 rounded-xl border border-border bg-card/95 backdrop-blur-sm p-4 flex flex-col gap-3 shadow-xl" style={{ zIndex: 10 }}>
      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.bg}`}>
          <Icon className={`h-4.5 w-4.5 ${meta.color}`} />
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-xs px-1"
        >✕</button>
      </div>
      <div>
        <p className={`text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>{meta.label}</p>
        <p className="text-sm font-semibold text-foreground mt-0.5">{sensor.name}</p>
        {sensor.clientName && (
          <p className="text-[10px] text-muted-foreground">{sensor.clientName}</p>
        )}
      </div>
      <div className="space-y-2 text-[10px]">
        {[
          { label: "IP", value: sensor.ip || "-", mono: true },
          { label: "Sensor ID", value: sensor.sensorId, mono: true },
          { label: "Events", value: sensor.eventsTotal.toLocaleString(), mono: false },
          { label: "Ports", value: sensor.ports.length > 0 ? sensor.ports.map(p => `:${p}`).join(" ") : "-", mono: true },
          { label: "Version", value: sensor.version || "-", mono: true },
        ].map(({ label, value, mono }) => (
          <div key={label}>
            <p className="text-muted-foreground uppercase tracking-wide text-[8px]">{label}</p>
            <p className={`text-foreground mt-0.5 truncate ${mono ? "font-mono" : "font-medium"}`}>{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2">
        {sensor.online ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-emerald-400 text-xs font-medium">Online</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground text-xs">Offline</span>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Stats bar ────────────────────────────────────────────────────────────────
function StatsBar({ groups }: { groups: Group[] }) {
  const all = groups.flatMap(g => [...g.external, ...g.internal])
  return (
    <div className="flex border-b border-border bg-muted/10">
      {[
        { label: "Clientes",  val: groups.length,                                      col: "text-foreground"  },
        { label: "Ext",       val: groups.reduce((s, g) => s + g.external.length, 0),  col: "text-cyan-400"    },
        { label: "Int",       val: groups.reduce((s, g) => s + g.internal.length, 0),  col: "text-violet-400"  },
        { label: "Online",    val: all.filter(s => s.online).length,                   col: "text-emerald-400" },
        { label: "Events",    val: all.reduce((s, x) => s + x.eventsTotal, 0).toLocaleString(), col: "text-foreground" },
      ].map(({ label, val, col }) => (
        <div key={label} className="flex-1 px-4 py-2.5 text-center border-r border-border/50 last:border-r-0">
          <p className={`text-base font-semibold ${col}`}>{val}</p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Main canvas ──────────────────────────────────────────────────────────────
function TopologyCanvas({ sensors }: { sensors: Sensor[] }) {
  const groups = useMemo(() => buildGroups(sensors), [sensors])
  const containerRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedClient, setSelectedClient] = useState<string | null>(null)

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(([entry]) => setW(entry.contentRect.width))
    obs.observe(containerRef.current)
    setW(containerRef.current.clientWidth)
    return () => obs.disconnect()
  }, [])

  const layout = useMemo(() => computeLayout(groups, W), [groups, W])

  // Determine which sensor is selected
  const allNodes = layout ? [...layout.extNodes, ...layout.intNodes] : []
  const selectedSensor = selectedId ? allNodes.find(n => n.sensor.sensorId === selectedId)?.sensor ?? null : null

  // Compute canvas height based on whether any client has internal sensors
  const hasInternal = groups.some(g => g.internal.length > 0)
  const canvasH = hasInternal ? CANVAS_MIN_H + 40 : CANVAS_MIN_H - 80

  const handleNodeClick = useCallback((id: string, clientKey: string) => {
    setSelectedId(prev => prev === id ? null : id)
    setSelectedClient(clientKey)
  }, [])

  const handleClientSelect = useCallback((key: string) => {
    setSelectedClient(prev => prev === key ? null : key)
    setSelectedId(null)
  }, [])

  return (
    <div className="flex flex-col" style={{ fontFamily: "inherit" }}>
      <StatsBar groups={groups} />

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative overflow-hidden select-none"
        style={{
          minHeight: canvasH,
          background: "radial-gradient(ellipse 80% 40% at 50% 0%, rgb(34 211 238 / 0.04) 0%, transparent 70%)",
          backgroundImage: `
            radial-gradient(ellipse 80% 40% at 50% 0%, rgb(34 211 238 / 0.04) 0%, transparent 70%),
            radial-gradient(circle, hsl(var(--border) / 0.5) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 28px 28px",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) { setSelectedId(null); setSelectedClient(null) }
        }}
      >
        {layout && W > 0 && (
          <>
            {/* SVG connection lines */}
            <Lines layout={layout} W={W} H={canvasH} selectedId={selectedId} />

            {/* Cluster overlays */}
            {layout.clusters.map(cl => (
              <ClusterOverlay
                key={cl.key}
                cluster={cl}
                selected={selectedClient === cl.key}
                onSelect={() => handleClientSelect(cl.key)}
              />
            ))}

            {/* Internet node */}
            <InternetNode x={layout.internet.x} y={layout.internet.y} />

            {/* External sensor nodes */}
            {layout.extNodes.map(n => (
              <SensorNodeCard
                key={n.sensor.sensorId}
                node={n}
                selected={selectedId === n.sensor.sensorId}
                onClick={() => handleNodeClick(n.sensor.sensorId, n.clientKey)}
              />
            ))}

            {/* Internal sensor nodes */}
            {layout.intNodes.map(n => (
              <SensorNodeCard
                key={n.sensor.sensorId}
                node={n}
                selected={selectedId === n.sensor.sensorId}
                onClick={() => handleNodeClick(n.sensor.sensorId, n.clientKey)}
              />
            ))}

            {/* Selected sensor info panel */}
            {selectedSensor && (
              <SensorPanel
                sensor={selectedSensor}
                onClose={() => { setSelectedId(null); setSelectedClient(null) }}
              />
            )}

            {/* Legend */}
            <div className="absolute bottom-4 left-4 flex items-center gap-4 text-[9px] text-muted-foreground/60" style={{ zIndex: 5 }}>
              <span className="flex items-center gap-1.5">
                <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="rgb(34,211,238)" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                Internet → Sensor
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="rgb(139,92,246)" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                Red interna
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Online
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Public export ────────────────────────────────────────────────────────────
export function NetworkTopology({ sensors }: { sensors: Sensor[] }) {
  if (sensors.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card flex flex-col items-center justify-center py-24 text-center">
        <Network className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">No hay sensores registrados</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Los sensores aparecen aquí automáticamente al iniciar y se agrupan por cliente.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <TopologyCanvas sensors={sensors} />
    </div>
  )
}
