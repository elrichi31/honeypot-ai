"use client"

import { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import { WifiOff } from "lucide-react"
import { getMeta } from "./constants"
import type { Sensor } from "@/lib/api"

export type SensorNodeData = {
  sensor: Sensor
  selected: boolean
  zone: "external" | "internal"
}

export const RfSensorNode = memo(function RfSensorNode({ data }: { data: SensorNodeData }) {
  const { sensor, zone } = data
  const meta = getMeta(sensor.protocol)
  const Icon = meta.icon

  return (
    <div
      className={`rounded-xl border bg-card p-3 transition-all duration-150 cursor-pointer ${
        data.selected ? meta.border : "border-border/50 hover:border-border"
      }`}
      style={{
        width: 118,
        minHeight: 104,
        boxShadow: data.selected
          ? `0 0 0 1px rgb(${meta.glow}/0.5), 0 0 22px 4px rgb(${meta.glow}/0.35)`
          : undefined,
      }}
    >
      {/* Receives connections from Internet or external sensors */}
      <Handle type="target" position={Position.Top} className="!border-none !bg-transparent" />

      <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${meta.bg} mb-2`}>
        <Icon className={`h-4 w-4 ${meta.color}`} />
      </div>

      <p className={`text-[10px] font-bold uppercase tracking-wider ${meta.color} leading-none`}>
        {meta.label}
      </p>
      <p className="text-[10px] text-foreground font-medium leading-snug truncate mt-1">
        {sensor.name}
      </p>
      <p className="font-mono text-[9px] text-muted-foreground truncate">
        {sensor.ip || "-"}
      </p>

      <div className="flex items-center gap-1 mt-1.5">
        {sensor.online ? (
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

      {/* Source handle for external sensors connecting down to internal */}
      {zone === "external" && (
        <Handle type="source" position={Position.Bottom} className="!border-none !bg-transparent" />
      )}
    </div>
  )
})
