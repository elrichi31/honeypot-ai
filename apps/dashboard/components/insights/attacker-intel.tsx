"use client"

import { Building2 } from "lucide-react"
import { Surface } from "@/components/ui/surface"
import type { AttackerIntel } from "@/lib/api"

type Props = { intel: AttackerIntel }

const TYPE_COLORS: Record<string, string> = {
  hosting:     "bg-sky-500/80",
  vpn:         "bg-violet-500/80",
  tor:         "bg-rose-500/80",
  proxy:       "bg-orange-500/80",
  residential: "bg-emerald-500/80",
}

const TYPE_LABELS: Record<string, string> = {
  hosting:     "Datacenter / Hosting",
  vpn:         "VPN",
  tor:         "Tor",
  proxy:       "Proxy",
  residential: "Residential / Unknown",
}

export function AttackerIntelView({ intel }: Props) {
  const { total, enriched, hostingTypes, topAsns } = intel

  const typeEntries = Object.entries(hostingTypes) as [string, number][]
  const maxType = Math.max(1, ...typeEntries.map(([, v]) => v))

  const enrichedPct = total > 0 ? Math.round((enriched / total) * 100) : 0

  return (
    <Surface className="p-5">
      <div className="mb-5 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-sky-400" />
        <div>
          <h2 className="font-semibold text-foreground">Attacker Infrastructure</h2>
          <p className="text-sm text-muted-foreground">
            ASN & hosting type breakdown for active source IPs
            {enrichedPct < 100 && ` · ${enrichedPct}% enriched`}
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Hosting type breakdown */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Source type
          </p>
          <div className="space-y-2">
            {typeEntries.map(([type, count]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-xs text-muted-foreground">{TYPE_LABELS[type] ?? type}</span>
                <div className="flex flex-1 items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${TYPE_COLORS[type] ?? "bg-zinc-500/80"}`}
                      style={{ width: `${maxType > 0 ? (count / maxType) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {count.toLocaleString("en-US")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top ASNs */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Top ASNs
          </p>
          {topAsns.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No enrichment data yet</p>
          ) : (
            <div className="space-y-2">
              {topAsns.map((entry) => {
                const maxCount = topAsns[0]?.count ?? 1
                return (
                  <div key={entry.asn} className="flex items-center gap-3">
                    <div className="flex w-full items-center gap-2">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-medium text-foreground">
                          {entry.org || entry.asn}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">{entry.asn}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="h-1.5 rounded-full bg-sky-400/60" style={{ width: `${Math.max(8, (entry.count / maxCount) * 60)}px` }} />
                        <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                          {entry.count}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Surface>
  )
}
