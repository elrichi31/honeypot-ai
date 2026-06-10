"use client"

import { useState } from "react"
import { Loader2, MapPin, Building2, Globe, ShieldAlert, ShieldCheck, Wifi, Lock } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import type { IpEnrichment } from "@/app/api/enrich/[ip]/route"
import { countryFlag } from "@/lib/formatting"

// ── score colour ─────────────────────────────────────────────────────────────
function scoreColor(score: number) {
  if (score >= 80) return "text-red-400"
  if (score >= 40) return "text-orange-400"
  if (score >= 10) return "text-yellow-400"
  return "text-emerald-400"
}

type Props = {
  ip: string
  /** Extra className for the trigger button */
  className?: string
}

export function IpEnrichmentPopover({ ip, className = "" }: Props) {
  const [data, setData]     = useState<IpEnrichment | null>(null)
  const [loading, setLoading] = useState(false)
  const [opened, setOpened]   = useState(false)

  async function handleOpen(open: boolean) {
    setOpened(open)
    if (open && !data && !loading) {
      setLoading(true)
      try {
        const res = await fetch(`/api/enrich/${encodeURIComponent(ip)}`)
        if (res.ok) setData(await res.json())
      } catch { /* silent */ } finally {
        setLoading(false)
      }
    }
  }

  const abuse  = data?.abuseipdb
  const info   = data?.ipinfo
  const spectra = data?.spectraAnalyze
  const score  = abuse?.abuseConfidenceScore ?? 0

  const flags: { label: string; on: boolean; color: string }[] = [
    { label: "VPN",     on: !!(abuse?.isVpn   || info?.isVpn),   color: "text-yellow-400" },
    { label: "Tor",     on: !!(abuse?.isTor   || info?.isTor),   color: "text-purple-400" },
    { label: "Proxy",   on: !!info?.isProxy,                     color: "text-orange-400" },
    { label: "Hosting", on: !!info?.isHosting,                   color: "text-blue-400"   },
  ]

  return (
    <Popover open={opened} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          className={`font-mono hover:underline hover:text-yellow-200 transition-colors cursor-pointer ${className}`}
          onClick={e => e.stopPropagation()}
        >
          {ip}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-80 p-0 border-border/80 bg-card shadow-xl"
        side="top"
        align="start"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-cyan-400" />
            <span className="font-mono text-sm font-semibold text-foreground">{ip}</span>
          </div>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No enrichment data available
          </div>
        ) : (
          <div className="divide-y divide-border/50">

            {/* Geo section */}
            {info && (
              <div className="px-4 py-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Location</p>
                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground">
                    {[info.city, info.region, info.country && `${countryFlag(info.country)} ${info.country}`]
                      .filter(Boolean).join(", ") || "—"}
                  </p>
                </div>
                {info.timezone && (
                  <p className="text-[11px] text-muted-foreground pl-5">{info.timezone}</p>
                )}
              </div>
            )}

            {/* ASN / ISP section */}
            {(info?.org || info?.asn || abuse?.isp) && (
              <div className="px-4 py-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Network</p>
                <div className="flex items-start gap-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-xs space-y-0.5">
                    {(info?.org || abuse?.isp) && (
                      <p className="text-foreground">{info?.org || abuse?.isp}</p>
                    )}
                    {info?.asn && (
                      <p className="text-muted-foreground font-mono">{info.asn}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Abuse score */}
            {abuse && (
              <div className="px-4 py-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">AbuseIPDB</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {score >= 50
                      ? <ShieldAlert className="h-4 w-4 text-red-400" />
                      : <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    }
                    <span className={`text-lg font-bold tabular-nums ${scoreColor(score)}`}>
                      {score}%
                    </span>
                    <span className="text-xs text-muted-foreground">confidence</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{abuse.totalReports} reports</p>
                    <p className="text-[11px] text-muted-foreground">{abuse.numDistinctUsers} users</p>
                  </div>
                </div>
                {/* Score bar */}
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      score >= 80 ? "bg-red-500" :
                      score >= 40 ? "bg-orange-500" :
                      score >= 10 ? "bg-yellow-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            )}

            {/* Flags */}
            {flags.some(f => f.on) && (
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Flags</p>
                <div className="flex gap-1.5 flex-wrap">
                  {flags.filter(f => f.on).map(f => (
                    <span
                      key={f.label}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted/50 ${f.color}`}
                    >
                      <Wifi className="h-2.5 w-2.5" />
                      {f.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Usage type */}
            {abuse?.usageType && (
              <div className="px-4 py-2.5 flex items-center gap-2">
                <Lock className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">{abuse.usageType}</span>
              </div>
            )}

            {spectra && (
              <div className="px-4 py-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Spectra Analyze</p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded border border-border/60 bg-secondary/30 p-2">
                    <p className="text-muted-foreground">3rd-party malicious</p>
                    <p className="font-mono text-foreground">{spectra.third_party_reputations?.statistics?.malicious ?? 0}</p>
                  </div>
                  <div className="rounded border border-border/60 bg-secondary/30 p-2">
                    <p className="text-muted-foreground">Downloaded malicious</p>
                    <p className="font-mono text-foreground">{spectra.downloaded_files_statistics?.malicious ?? 0}</p>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
