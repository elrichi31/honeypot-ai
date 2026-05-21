"use client"

import { useEffect, useState } from "react"
import { ShieldAlert, ShieldCheck, Skull, AlertTriangle, ExternalLink } from "lucide-react"

type ThreatEntry = {
  srcIp: string
  totalEvents: number
  sources: string[]
  protocols: string[]
  lastSeen: string
  loginSuccesses: number
}

function riskLevel(entry: ThreatEntry): "critical" | "high" | "medium" | "low" {
  if (entry.loginSuccesses > 0)   return "critical"
  if (entry.totalEvents >= 100)   return "high"
  if (entry.totalEvents >= 20)    return "medium"
  return "low"
}

const RISK_STYLES = {
  critical: { label: "Critical", color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20",    Icon: Skull         },
  high:     { label: "High",     color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", Icon: ShieldAlert   },
  medium:   { label: "Medium",   color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/20", Icon: AlertTriangle },
  low:      { label: "Low",      color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20",   Icon: ShieldCheck   },
}

const SOURCE_COLORS: Record<string, string> = {
  ssh:      "bg-cyan-400/15 text-cyan-400",
  protocol: "bg-blue-400/15 text-blue-400",
  web:      "bg-green-400/15 text-green-400",
}

function formatTs(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

type Props = { clientSlug: string }

export function ClientAlerts({ clientSlug }: Props) {
  const [entries, setEntries] = useState<ThreatEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/clients/${clientSlug}/threats`)
      .then(r => r.json())
      .then((data: ThreatEntry[]) => setEntries(data ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [clientSlug])

  const criticalCount = entries.filter(e => riskLevel(e) === "critical").length
  const highCount     = entries.filter(e => riskLevel(e) === "high").length

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-400/10">
          <ShieldAlert className="h-4 w-4 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-foreground">Alerts</h2>
          <p className="text-xs text-muted-foreground">
            {loading
              ? "Loading…"
              : entries.length === 0
                ? "No threat activity detected"
                : `${entries.length} IPs · ${criticalCount} critical · ${highCount} high`}
          </p>
        </div>
      </div>

      {/* Summary badges */}
      {!loading && entries.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(["critical", "high", "medium", "low"] as const).map(level => {
            const count = entries.filter(e => riskLevel(e) === level).length
            if (count === 0) return null
            const style = RISK_STYLES[level]
            return (
              <span
                key={level}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.color}`}
              >
                {count} {style.label}
              </span>
            )
          })}
        </div>
      )}

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-red-400" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10">
          <ShieldCheck className="h-8 w-8 text-emerald-400/50" />
          <p className="text-sm text-muted-foreground">No threats detected for this client</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => {
            const level = riskLevel(entry)
            const style = RISK_STYLES[level]
            const Icon  = style.Icon

            return (
              <div
                key={entry.srcIp}
                className={`flex items-start gap-3 rounded-lg border ${style.border} bg-background/40 px-3 py-2.5`}
              >
                {/* Risk icon */}
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${style.bg} mt-0.5`}>
                  <Icon className={`h-3.5 w-3.5 ${style.color}`} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium text-foreground">{entry.srcIp}</span>
                    <span className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 ${style.bg} ${style.color}`}>
                      {style.label}
                    </span>
                    {entry.loginSuccesses > 0 && (
                      <span className="text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-red-400/10 text-red-400">
                        {entry.loginSuccesses} login{entry.loginSuccesses > 1 ? "s" : ""} succeeded
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Source badges */}
                    <div className="flex gap-1 flex-wrap">
                      {entry.sources.map(src => (
                        <span
                          key={src}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${SOURCE_COLORS[src] ?? "bg-muted/50 text-muted-foreground"}`}
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                    {/* Event count */}
                    <span className="text-xs text-muted-foreground">
                      {entry.totalEvents.toLocaleString()} events
                    </span>
                  </div>
                </div>

                {/* Last seen */}
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-muted-foreground/60 whitespace-nowrap">
                    {formatTs(entry.lastSeen)}
                  </p>
                  <a
                    href={`/threats/${encodeURIComponent(entry.srcIp)}`}
                    className="inline-flex items-center gap-1 text-[10px] text-cyan-400/70 hover:text-cyan-400 transition-colors mt-0.5"
                  >
                    Details <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
