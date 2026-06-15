"use client"

import { Network } from "lucide-react"
import type { Sensor } from "@/lib/api"
import { Surface } from "@/components/ui/surface"
import { TopologyCanvas } from "./topology-canvas"

interface NetworkTopologyProps {
  sensors: Sensor[]
}

export function NetworkTopology({ sensors }: NetworkTopologyProps) {
  if (sensors.length === 0) {
    return (
      <Surface className="flex flex-col items-center justify-center py-24 text-center">
        <Network className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">No sensors registered</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Sensors appear here automatically on startup and are grouped by client.
        </p>
      </Surface>
    )
  }

  return (
    <Surface className="overflow-hidden" style={{ height: 680 }}>
      <TopologyCanvas sensors={sensors} />
    </Surface>
  )
}
