"use client"

import Link from "next/link"
import { Ghost } from "lucide-react"
import { formatRelative } from "@/lib/sensor-display"
import { StatCell } from "@/components/sensors/sensor-stats"
import { useT } from "@/components/locale-provider"
import type { DeceptionNetworkSummary, DeceptionNetworkStatus } from "@/lib/api/deception"

// Mirrors how SensorCard encodes health in the border (degraded / online /
// offline) so a deception network reads like the rest of the fleet.
const STATUS: Record<DeceptionNetworkStatus, { border: string; chip: string; dot: string }> = {
  breached: { border: "border-red-400/40",   chip: "bg-red-400/15 text-red-400",     dot: "bg-red-400"     },
  active:   { border: "border-amber-400/30", chip: "bg-amber-400/15 text-amber-400", dot: "bg-amber-400"   },
  quiet:    { border: "border-border/40 opacity-70", chip: "bg-muted/60 text-muted-foreground", dot: "bg-muted-foreground/50" },
}

export function ClientDeceptionCard({ network }: { network: DeceptionNetworkSummary }) {
  const t = useT()
  const s = STATUS[network.status]

  return (
    <Link
      href={`/clients/${encodeURIComponent(network.clientSlug)}/deception`}
      className={`flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-white/[0.02] ${s.border}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
        <Ghost className="h-4 w-4 shrink-0 text-violet-400" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{network.clientName}</p>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${s.chip}`}>
          {t(`deception.status.${network.status}`)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCell label={t("deception.networks.nodes")}>
          <p className="text-sm font-semibold text-foreground">
            {network.nodesOnline}
            <span className="text-muted-foreground">/{network.nodesTotal}</span>
          </p>
        </StatCell>
        <StatCell label={t("deception.networks.hits24h")}>
          <p className="text-sm font-semibold text-foreground">{network.hits24h.toLocaleString()}</p>
        </StatCell>
        <StatCell label={t("deception.networks.authAttempts")}>
          <p className="text-xs text-foreground">{network.authAttempts24h.toLocaleString()}</p>
        </StatCell>
        <StatCell label={t("deception.networks.sourceIps")}>
          <p className="text-xs text-foreground">{network.uniqueSrcIps24h.toLocaleString()}</p>
        </StatCell>
        <StatCell label={t("deception.networks.lateral")}>
          <p className="text-xs text-foreground">{network.activeChains24h.toLocaleString()}</p>
        </StatCell>
        <StatCell label={t("deception.networks.lastEvent")}>
          <p className="text-xs text-foreground">{network.lastEvent ? formatRelative(network.lastEvent) : "—"}</p>
        </StatCell>
      </div>
    </Link>
  )
}
