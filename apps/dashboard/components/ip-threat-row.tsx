"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { IpEnrichment } from "@/lib/ip-enrichment"
import { Flag } from "@/components/ui/flag"
import { AttackTypeBadge } from "@/components/attack-type-badge"
import { IpEnrichment as IpEnrichmentPanel } from "@/components/ip-enrichment"

interface IpThreatRowProps {
  ip: string
  count: number
  attackTypes: string[]
  location: { country?: string; countryName?: string } | null
  initialData: IpEnrichment | null
}

function abuseColor(score: number) {
  if (score >= 80) return "text-destructive"
  if (score >= 40) return "text-warning"
  if (score > 0) return "text-yellow-400"
  return "text-success"
}

function vtColor(malicious: number) {
  if (malicious >= 5) return "text-destructive"
  if (malicious >= 1) return "text-warning"
  return "text-success"
}

function PrivacyTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
      {label}
    </span>
  )
}

export function IpThreatRow({ ip, count, attackTypes, location, initialData }: IpThreatRowProps) {
  const [expanded, setExpanded] = useState(false)

  const ab = initialData?.abuseipdb
  const info = initialData?.ipinfo
  const vt = initialData?.virustotal

  const countryName = ab?.countryName || info?.country || location?.countryName
  const countryCode = ab?.countryCode || info?.country || location?.country
  const isp = ab?.isp || info?.org

  const vtTotal = vt ? Object.keys(vt.last_analysis_results).length : 0
  const vtMalicious = vt?.last_analysis_stats.malicious ?? 0

  const privacyTags: string[] = []
  if (ab?.isVpn || info?.isVpn) privacyTags.push("VPN")
  if (ab?.isTor || info?.isTor) privacyTags.push("Tor")
  if (info?.isProxy) privacyTags.push("Proxy")
  if (info?.isHosting) privacyTags.push("DC")

  return (
    <div className="divide-y divide-border">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-[11rem] shrink-0">
          {countryCode && <Flag code={countryCode} />}
          <Link
            href={`/web-attacks/${encodeURIComponent(ip)}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-sm text-blue-400 hover:underline"
          >
            {ip}
          </Link>
        </div>

        <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">
          {countryName ?? "—"}
        </span>

        <span className="text-xs text-muted-foreground max-w-[11rem] truncate shrink-0" title={isp}>
          {isp ?? "—"}
        </span>

        <div className="flex items-center gap-1 shrink-0 min-w-[4.5rem]">
          {ab != null ? (
            <span className={`font-mono text-xs font-semibold tabular-nums ${abuseColor(ab.abuseConfidenceScore)}`}>
              {ab.abuseConfidenceScore}%
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          <span className="text-[10px] text-muted-foreground">abuse</span>
        </div>

        <div className="flex items-center gap-1 shrink-0 min-w-[4.5rem]">
          {vt != null ? (
            <span className={`font-mono text-xs font-semibold tabular-nums ${vtColor(vtMalicious)}`}>
              {vtMalicious}/{vtTotal}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          <span className="text-[10px] text-muted-foreground">VT</span>
        </div>

        <div className="flex flex-wrap gap-1 shrink-0">
          {privacyTags.map((t) => <PrivacyTag key={t} label={t} />)}
        </div>

        <div className="flex flex-wrap gap-1 shrink-0">
          {attackTypes.slice(0, 3).map((t) => (
            <AttackTypeBadge key={t} type={t} size="xs" />
          ))}
        </div>

        <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground whitespace-nowrap">
          {count} hits
        </span>

        <span className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border bg-secondary/10 p-4">
          <IpEnrichmentPanel ip={ip} initialData={initialData} autoFetch={!initialData} />
        </div>
      )}
    </div>
  )
}
