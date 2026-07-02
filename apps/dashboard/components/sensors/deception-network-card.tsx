"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight, Ghost, Wifi } from "lucide-react"
import { formatRelative } from "@/lib/sensor-display"
import { Surface } from "@/components/ui/surface"
import { useT } from "@/components/locale-provider"
import { getMeta } from "@/components/network/constants"
import type { Sensor } from "@/lib/api"

/**
 * A single collapsible card that stands in for the N loose OpenCanary trap-node
 * sensors of one deception network. Showing five bare sensor cards read as
 * clutter; this groups them as one "Deception Network" with its IPs and the
 * containers (nodes) that compose it. Expand to see each node's IP, ports, and
 * heartbeat. Links through to the per-client deception view when a client owns
 * the network.
 */
export function DeceptionNetworkCard({
  sensors,
  clientSlug,
}: {
  sensors: Sensor[]
  clientSlug: string | null
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const online = sensors.filter((s) => s.online).length
  const total = sensors.length
  const events = sensors.reduce((sum, s) => sum + s.eventsTotal, 0)
  // Stable display order: online first, then by IP for readability.
  const nodes = [...sensors].sort(
    (a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || a.ip.localeCompare(b.ip),
  )

  return (
    <Surface className="sm:col-span-2 lg:col-span-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Ghost className="h-4 w-4 text-violet-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{t("sensors.deception.title")}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {nodes.map((n) => n.ip).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Wifi className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-foreground">{online}</span>/{total} {t("sensors.deception.nodes")}
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {t("sensors.deception.events", { n: events.toLocaleString() })}
        </span>
        {clientSlug && (
          <Link
            href={`/clients/${clientSlug}/deception`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
          >
            {t("sensors.deception.viewNetwork")}
          </Link>
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 divide-y divide-border/40">
          {nodes.map((node) => {
            const meta = getMeta(node.realProtocol ?? node.protocol)
            return (
              <div key={node.sensorId} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${node.online ? "bg-emerald-400" : "bg-red-400"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{node.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {node.ip} · {t("sensors.deception.ports", { ports: node.ports.join(", ") || "—" })}
                  </p>
                </div>
                <span className={`hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium sm:inline ${meta.color} ${meta.bg}`}>
                  {meta.label}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {node.eventsTotal.toLocaleString()} ev.
                </span>
                <span className="w-16 text-right text-[10px] text-muted-foreground/70">
                  {node.online ? t("sensors.deception.online") : formatRelative(node.lastSeen)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Surface>
  )
}
