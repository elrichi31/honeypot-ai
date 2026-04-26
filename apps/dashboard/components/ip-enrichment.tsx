"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, AlertTriangle, Building2, MapPin, Loader2, Server, VenetianMask, Clock, Hash } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { IpEnrichment } from "@/app/api/enrich/[ip]/route"

const ABUSE_COLOR = (score: number) => {
  if (score >= 80) return "text-destructive"
  if (score >= 40) return "text-warning"
  if (score > 0)  return "text-yellow-400"
  return "text-success"
}

interface Props {
  ip: string
  initialData?: IpEnrichment | null
  autoFetch?: boolean
}

export function IpEnrichment({ ip, initialData, autoFetch = true }: Props) {
  const [data, setData] = useState<IpEnrichment | null>(initialData ?? null)
  const [loading, setLoading] = useState(autoFetch && !initialData)

  function doFetch() {
    setLoading(true)
    fetch(`/api/enrich/${encodeURIComponent(ip)}`)
      .then((r) => r.json())
      .then((d: IpEnrichment) => {
        if (d.abuseipdb || d.ipinfo) setData(d)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (autoFetch && !initialData) doFetch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip])

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Consultando feeds de inteligencia…
      </div>
    )
  }

  if (!data) {
    if (!autoFetch) {
      return (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <span>IP Enrichment — sin datos en caché</span>
          </div>
          <button
            onClick={doFetch}
            className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors"
          >
            Consultar ahora
          </button>
        </div>
      )
    }
    return null
  }

  const ab = data.abuseipdb
  const info = data.ipinfo
  const privacyFlags = info ? [
    info.isHosting && "Hosting/DC",
    info.isVpn    && "VPN",
    info.isProxy  && "Proxy",
    info.isTor    && "Tor",
  ].filter(Boolean) as string[] : []

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
          <h3 className="font-semibold text-foreground">IP Enrichment</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          actualizado {formatDistanceToNow(new Date(data.cachedAt), { addSuffix: true })}
        </span>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2">
        {/* AbuseIPDB */}
        {ab && (
          <div className="bg-card p-4 space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">AbuseIPDB</p>

            <div className="flex items-end gap-2">
              <span className={`text-3xl font-bold tabular-nums ${ABUSE_COLOR(ab.abuseConfidenceScore)}`}>
                {ab.abuseConfidenceScore}%
              </span>
              <span className="mb-1 text-xs text-muted-foreground">confianza de abuso</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reportes totales</span>
                <span className="font-semibold text-foreground">{ab.totalReports.toLocaleString('en-US')}</span>
              </div>
              {ab.isp && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate text-foreground">{ab.isp}</span>
                </div>
              )}
              {ab.usageType && (
                <div className="flex items-center gap-1.5">
                  <Server className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate text-muted-foreground">{ab.usageType}</span>
                </div>
              )}
              {ab.isVpn && (
                <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-400">
                  <VenetianMask className="h-3 w-3" /> VPN / Proxy
                </span>
              )}
              {ab.lastReportedAt && (
                <p className="text-muted-foreground">
                  Último reporte {formatDistanceToNow(new Date(ab.lastReportedAt), { addSuffix: true })}
                </p>
              )}
              {ab.abuseConfidenceScore >= 80 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  <span className="text-[11px] font-medium text-destructive">IP ampliamente reportada como maliciosa</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ipinfo */}
        {info && (
          <div className="bg-card p-4 space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">ipinfo.io</p>

            <div className="space-y-1.5 text-xs">
              {info.org && (
                <div className="flex items-start gap-1.5">
                  <Building2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="font-medium text-foreground">{info.org}</span>
                </div>
              )}
              {info.asn && (
                <div className="flex items-center gap-1.5">
                  <Hash className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="font-mono text-muted-foreground">{info.asn}</span>
                </div>
              )}
              {(info.city || info.region || info.country) && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {[info.city, info.region, info.country].filter(Boolean).join(", ")}
                    {info.postal ? ` (${info.postal})` : ""}
                  </span>
                </div>
              )}
              {info.timezone && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{info.timezone}</span>
                </div>
              )}
              {info.hostname && (
                <div className="flex items-center gap-1.5">
                  <Server className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-[10px] text-muted-foreground">{info.hostname}</span>
                </div>
              )}
              {privacyFlags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {privacyFlags.map((f) => (
                    <span key={f} className="inline-flex items-center rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-400">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
