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
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-border bg-card text-center">
        <Network className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">No sensors registered</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Sensors appear here automatically on startup and are grouped by client.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden rounded-xl border border-border bg-card">
      <TopologyCanvas sensors={sensors} />
    </div>
  )
}
