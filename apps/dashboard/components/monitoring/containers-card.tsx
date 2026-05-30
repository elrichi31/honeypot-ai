"use client"

import { Container } from "lucide-react"
import { cn } from "@/lib/utils"

type ContainerInfo = {
  name: string
  state: string
  status: string
  image: string
  created: number
}

function StateBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    running:    "bg-emerald-400/10 text-emerald-400",
    paused:     "bg-yellow-400/10 text-yellow-400",
    exited:     "bg-red-400/10 text-red-400",
    restarting: "bg-blue-400/10 text-blue-400",
  }
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", styles[state] ?? "bg-muted text-muted-foreground")}>
      {state}
    </span>
  )
}

export function ContainersCard({ containers, error }: { containers: ContainerInfo[]; error?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <Container className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-medium">Services</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{containers.length} containers</span>
      </div>

      {error ? (
        <p className="text-[11px] text-muted-foreground py-2">
          {error === "socket_unavailable"
            ? "Docker socket not available. Mount /var/run/docker.sock in the dashboard container."
            : error}
        </p>
      ) : (
        <div className="space-y-1">
          {containers.map((c) => (
            <div key={c.name} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors">
              <StateBadge state={c.state} />
              <span className="flex-1 font-mono text-[12px] truncate">{c.name}</span>
              <span className="text-[10px] text-muted-foreground/60 truncate max-w-[120px] hidden sm:block">{c.image}</span>
              <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap hidden md:block">{c.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
