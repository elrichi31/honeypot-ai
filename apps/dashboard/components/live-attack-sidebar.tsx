"use client"

import { getProtocolDotClass, getProtocolMarkerColor } from "@/lib/protocol-colors"
import { countryLabel } from "@/components/live-attack-country"
import type { Attack, HoverCountry } from "@/components/live-attack-map-types"

export function CountryHoverTooltip({ hoverCountry, visible }: { hoverCountry: HoverCountry | null; visible: boolean }) {
  if (!visible || !hoverCountry) return null
  return (
    <div className="absolute bottom-4 left-4 z-20 rounded-md border border-white/10 bg-[#0a1020]/92 px-3 py-2 text-xs text-slate-200 shadow-2xl backdrop-blur-sm">
      <p className="font-medium">{countryLabel(hoverCountry.country)}</p>
      <p className="text-slate-400">{hoverCountry.count.toLocaleString()} attacks - last 24h</p>
    </div>
  )
}

export function RecentAttacksSidebar({ recent }: { recent: Attack[] }) {
  return (
    <div className="absolute right-4 top-4 z-20 w-56 overflow-hidden rounded-xl border border-white/8 bg-[#0a1020]/85 backdrop-blur-sm">
      <div className="border-b border-white/8 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Recent Attacks</p>
      </div>
      {recent.length === 0 ? <EmptyRecent /> : <RecentRows recent={recent} />}
    </div>
  )
}

function EmptyRecent() {
  return <p className="px-3 py-5 text-center text-[11px] text-slate-500">Waiting for events...</p>
}

function RecentRows({ recent }: { recent: Attack[] }) {
  return (
    <div className="max-h-[65vh] divide-y divide-white/5 overflow-y-auto">
      {recent.map((attack) => <RecentRow key={attack.id} attack={attack} />)}
    </div>
  )
}

function RecentRow({ attack }: { attack: Attack }) {
  const color = getProtocolMarkerColor(attack.type)
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${getProtocolDotClass(attack.type)}`} />
      <span className="flex-1 truncate font-mono text-[10px] text-slate-200">{attack.ip}</span>
      <span className="flex-shrink-0 text-[9px] text-slate-500">{attack.country || "??"}</span>
      <span className="flex-shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ color, background: `${color}22` }}>
        {attack.dstPort ? `${attack.type}:${attack.dstPort}` : attack.type}
      </span>
    </div>
  )
}
