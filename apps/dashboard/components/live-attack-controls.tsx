"use client"

import { Globe, Map as MapIcon, Maximize2, Minimize2 } from "lucide-react"
import type React from "react"
import { getProtocolChipClass } from "@/lib/protocol-colors"
import type { ViewMode } from "@/components/live-attack-map-types"

interface Props {
  stats: Record<string, number>
  total24h: number
  countryCount: number
  connected: boolean
  viewMode: ViewMode
  isFullscreen: boolean
  setViewMode: (mode: ViewMode) => void
  toggleFullscreen: () => void
}

export function LiveAttackControls(props: Props) {
  return (
    <div className="absolute left-4 top-4 z-20 flex flex-col gap-2">
      <ProtocolChips stats={props.stats} />
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill label="24h" value={props.total24h.toLocaleString()} />
        {props.countryCount > 0 && <CountryPill count={props.countryCount} />}
        <ConnectionPill connected={props.connected} />
        <ViewToggle viewMode={props.viewMode} setViewMode={props.setViewMode} />
        <FullscreenButton isFullscreen={props.isFullscreen} toggleFullscreen={props.toggleFullscreen} />
      </div>
    </div>
  )
}

// Always show these core protocols even at 0, so the map reflects the whole
// sensor fleet. Any other protocol that actually sends an event (e.g. a new
// dionaea service) is appended dynamically from the live stats.
const CORE_CHIPS = ["ssh", "http", "ftp", "mysql", "smb", "port-scan", "ids"]

function ProtocolChips({ stats }: { stats: Record<string, number> }) {
  const dynamic = Object.keys(stats).filter((t) => !CORE_CHIPS.includes(t))
  const types = [...CORE_CHIPS, ...dynamic.sort()]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {types.map((type) => (
        <div key={type} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium tracking-wide ${getProtocolChipClass(type)}`}>
          <span className="uppercase opacity-60">{type}</span>
          <span className="font-bold">{(stats[type] ?? 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-slate-300">
      <span className="opacity-60">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  )
}

function CountryPill({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-slate-400">
      <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ background: "#f43f5e88" }} />
      {count} countries
    </div>
  )
}

function ConnectionPill({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px]">
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-400" : "bg-slate-500"}`} />
      <span className={connected ? "text-emerald-400" : "text-slate-500"}>{connected ? "Live" : "Offline"}</span>
    </div>
  )
}

function ViewToggle({ viewMode, setViewMode }: { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="flex overflow-hidden rounded-full border border-white/10 bg-white/5">
      <ViewButton active={viewMode === "2d"} onClick={() => setViewMode("2d")} icon={<MapIcon className="h-3 w-3" />} label="2D" />
      <ViewButton active={viewMode === "3d"} onClick={() => setViewMode("3d")} icon={<Globe className="h-3 w-3" />} label="3D" />
    </div>
  )
}

function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-medium transition-colors ${active ? "bg-white/15 text-white" : "text-slate-400 hover:text-slate-200"}`}>
      {icon}
      {label}
    </button>
  )
}

function FullscreenButton({ isFullscreen, toggleFullscreen }: { isFullscreen: boolean; toggleFullscreen: () => void }) {
  return (
    <button onClick={toggleFullscreen} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-slate-300 transition-colors hover:bg-white/10" title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}>
      {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
      {isFullscreen ? "Salir" : "Fullscreen"}
    </button>
  )
}
