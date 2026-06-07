"use client"

import { Ghost, Activity, KeyRound, Crosshair, Server } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { DeceptionOverview as Overview } from "@/lib/api/deception"

function Card({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function DeceptionOverview({ data }: { data: Overview }) {
  const allOnline = data.nodesTotal > 0 && data.nodesOnline === data.nodesTotal
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card
        icon={<Server className="h-4 w-4 text-emerald-400" />}
        label="Trap nodes online"
        value={`${data.nodesOnline}/${data.nodesTotal}`}
        sub={allOnline ? "all reporting" : "some offline"}
        color={allOnline ? "text-emerald-400" : "text-yellow-400"}
      />
      <Card
        icon={<Activity className="h-4 w-4 text-blue-400" />}
        label="Interactions (24h)"
        value={data.hits24h.toLocaleString()}
        sub={`${data.hits7d.toLocaleString()} in 7d`}
        color="text-blue-400"
      />
      <Card
        icon={<KeyRound className="h-4 w-4 text-red-400" />}
        label="Auth attempts (24h)"
        value={data.authAttempts24h.toLocaleString()}
        sub="credentials tried on traps"
        color="text-red-400"
      />
      <Card
        icon={<Crosshair className="h-4 w-4 text-purple-400" />}
        label="Last lateral move"
        value={data.lastEvent ? formatDistanceToNow(new Date(data.lastEvent), { addSuffix: true }) : "—"}
        sub={`${data.uniqueInternalIps} internal source${data.uniqueInternalIps === 1 ? "" : "s"}`}
        color="text-purple-400"
      />
    </div>
  )
}
