"use client"

import { Network } from "lucide-react"
import type { Sensor } from "@/lib/api"
import { TopologyCanvas } from "./topology-canvas"

interface NetworkTopologyProps {
  sensors: Sensor[]
}

export function NetworkTopology({ sensors }: NetworkTopologyProps) {
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
    <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ minHeight: 660 }}>
      <TopologyCanvas sensors={sensors} />
    </div>
  )
}
