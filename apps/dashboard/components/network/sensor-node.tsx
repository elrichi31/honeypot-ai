import { WifiOff } from "lucide-react"
import { getMeta } from "./constants"
import { NODE_W, NODE_H } from "./constants"
import type { SensorNode } from "./types"

interface SensorNodeCardProps {
  node: SensorNode
  selected: boolean
  onClick: () => void
}

export function SensorNodeCard({ node, selected, onClick }: SensorNodeCardProps) {
  const meta = getMeta(node.sensor.protocol)
  const Icon = meta.icon

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`absolute rounded-xl border bg-card transition-all duration-150 p-3 cursor-pointer ${
        selected ? meta.border : "border-border/50 hover:border-border"
      }`}
      style={{
        left:   node.x - NODE_W / 2,
        top:    node.y - NODE_H / 2,
        width:  NODE_W,
        height: NODE_H,
        zIndex: 2,
        boxShadow: selected
          ? `0 0 0 1px rgb(${meta.glow}/0.5), 0 0 22px 4px rgb(${meta.glow}/0.35)`
          : undefined,
      }}
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${meta.bg} mb-2`}>
        <Icon className={`h-4 w-4 ${meta.color}`} />
      </div>

      <p className={`text-[10px] font-bold uppercase tracking-wider ${meta.color} leading-none`}>
        {meta.label}
      </p>
      <p className="text-[10px] text-foreground font-medium leading-snug truncate mt-1">
        {node.sensor.name}
      </p>
      <p className="font-mono text-[9px] text-muted-foreground truncate">
        {node.sensor.ip || "-"}
      </p>

      <div className="flex items-center gap-1 mt-1.5">
        {node.sensor.online ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[9px] text-emerald-400">Online</span>
          </>
        ) : (
          <>
            <WifiOff className="h-2.5 w-2.5 text-muted-foreground/40" />
            <span className="text-[9px] text-muted-foreground/50">Offline</span>
          </>
        )}
      </div>
    </div>
  )
}
