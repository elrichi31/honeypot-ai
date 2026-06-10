"use client"

import { Server } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Surface } from "@/components/ui/surface"
import type { DeceptionNode } from "@/lib/api/deception"

function StatusDot({ online }: { online: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`} />
    </span>
  )
}

export function DeceptionNodesGrid({ nodes }: { nodes: DeceptionNode[] }) {
  if (nodes.length === 0) {
    return (
      <Surface className="px-4 py-6 text-center text-sm text-muted-foreground">
        No deception nodes registered.
      </Surface>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {nodes.map(node => (
        <Surface key={node.sensorId} padded>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{node.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <StatusDot online={node.online} />
              <span className={`text-[10px] ${node.online ? "text-emerald-400" : "text-red-400"}`}>
                {node.online ? "online" : "offline"}
              </span>
            </div>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">{node.ip} · ports {node.ports.join(", ") || "—"}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <p className="text-lg font-semibold tabular-nums text-blue-400">{node.hits.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">interactions</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-red-400">{node.authAttempts.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">auth attempts</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground/60">
            {node.lastHit ? `last hit ${formatDistanceToNow(new Date(node.lastHit), { addSuffix: true })}` : "no activity"}
          </p>
        </Surface>
      ))}
    </div>
  )
}
