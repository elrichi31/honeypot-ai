"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, AlertTriangle, Building2, MapPin, Loader2, Server, VenetianMask, Clock, Hash, Globe, Flag, MessageSquare, ChevronDown, ChevronUp } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { IpEnrichment, AbuseReport } from "@/app/api/enrich/[ip]/route"

const ABUSE_CATEGORIES: Record<number, string> = {
  1: "DNS Compromise", 2: "DNS Poisoning", 3: "Fraud Orders", 4: "DDoS Attack",
  5: "FTP Brute-Force", 6: "Ping of Death", 7: "Phishing", 8: "Fraud VoIP",
  9: "Open Proxy", 10: "Web Spam", 11: "Email Spam", 12: "Blog Spam",
  13: "VPN IP", 14: "Port Scan", 15: "Hacking", 16: "SQL Injection",
  17: "Spoofing", 18: "Brute-Force", 19: "Bad Web Bot", 20: "Exploited Host",
  21: "Web App Attack", 22: "SSH", 23: "IoT Targeted",
}

const ABUSE_COLOR = (score: number) => {
  if (score >= 80) return "text-destructive"
  if (score >= 40) return "text-warning"
  if (score > 0)  return "text-yellow-400"
  return "text-success"
}

function Tag({ label, variant = "neutral" }: { label: string; variant?: "danger" | "warn" | "neutral" }) {
  const cls = variant === "danger"
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : variant === "warn"
    ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
    : "border-border bg-secondary text-muted-foreground"
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  )
}

function ReportRow({ report }: { report: AbuseReport }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(new Date(report.reportedAt), { addSuffix: true })}
          {report.reporterCountryName ? ` · ${report.reporterCountryName}` : ""}
        </span>
        <div className="flex flex-wrap gap-1 justify-end">
          {report.categories.map(c => (
            <span key={c} className="rounded border border-border bg-secondary px-1.5 py-0 text-[9px] text-muted-foreground">
              {ABUSE_CATEGORIES[c] ?? `Cat ${c}`}
            </span>
          ))}
        </div>
      </div>
      {report.comment && (
        <p className="text-[11px] text-foreground leading-relaxed line-clamp-2">{report.comment}</p>
      )}
    </div>
  )
}

interface Props {
  ip: string
  initialData?: IpEnrichment | null
  autoFetch?: boolean
}

export function IpEnrichment({ ip, initialData, autoFetch = true }: Props) {
  const [data, setData] = useState<IpEnrichment | null>(initialData ?? null)
  const [loading, setLoading] = useState(autoFetch && !initialData)
  const [showAllReports, setShowAllReports] = useState(false)

  function doFetch() {
    setLoading(true)
    fetch(`/api/enrich/${encodeURIComponent(ip)}`)
      .then(r => r.json())
      .then((d: IpEnrichment) => { if (d.abuseipdb || d.ipinfo) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (autoFetch && !initialData) doFetch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip])

  if (loading) return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Consultando feeds de inteligencia…
    </div>
  )

  if (!data) {
    if (!autoFetch) return (
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
          <span>IP Enrichment — sin datos en caché</span>
        </div>
        <button onClick={doFetch} className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors">
          Consultar ahora
        </button>
      </div>
    )
    return null
  }

  const ab = data.abuseipdb
  const info = data.ipinfo

  const privacyFlags = [
    ab?.isTor    && { label: "Tor Exit", v: "danger" as const },
    ab?.isVpn    && { label: "VPN (AbuseIPDB)", v: "warn" as const },
    info?.isTor  && !ab?.isTor && { label: "Tor", v: "danger" as const },
    info?.isVpn  && !ab?.isVpn && { label: "VPN", v: "warn" as const },
    info?.isProxy  && { label: "Proxy", v: "warn" as const },
    info?.isHosting && { label: "Hosting/DC", v: "neutral" as const },
  ].filter(Boolean) as { label: string; v: "danger" | "warn" | "neutral" }[]

  const visibleReports = showAllReports ? (ab?.reports ?? []) : (ab?.reports ?? []).slice(0, 3)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
          <h3 className="font-semibold text-foreground">IP Enrichment</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          actualizado {formatDistanceToNow(new Date(data.cachedAt), { addSuffix: true })}
        </span>
      </div>

      <div className="divide-y divide-border">
        {/* ── AbuseIPDB ── */}
        {ab && (
          <div className="p-4 space-y-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">AbuseIPDB</p>

            {/* Score + quick stats */}
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <span className={`text-4xl font-bold tabular-nums ${ABUSE_COLOR(ab.abuseConfidenceScore)}`}>
                  {ab.abuseConfidenceScore}%
                </span>
                <span className="ml-2 text-xs text-muted-foreground">confianza de abuso</span>
              </div>
              <div className="flex gap-4 text-xs">
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">{ab.totalReports.toLocaleString('en-US')}</p>
                  <p className="text-muted-foreground">reportes</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">{ab.numDistinctUsers.toLocaleString('en-US')}</p>
                  <p className="text-muted-foreground">usuarios distintos</p>
                </div>
              </div>
            </div>

            {/* Alert banner */}
            {ab.abuseConfidenceScore >= 80 && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                <span className="text-xs font-medium text-destructive">IP ampliamente reportada como maliciosa</span>
              </div>
            )}

            {/* Detail grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {ab.isp && (
                <div className="flex items-center gap-1.5 col-span-2">
                  <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="font-medium text-foreground">{ab.isp}</span>
                </div>
              )}
              {ab.domain && (
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{ab.domain}</span>
                </div>
              )}
              {ab.countryName && (
                <div className="flex items-center gap-1.5">
                  <Flag className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{ab.countryName} ({ab.countryCode})</span>
                </div>
              )}
              {ab.usageType && (
                <div className="flex items-center gap-1.5 col-span-2">
                  <Server className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{ab.usageType}</span>
                </div>
              )}
              {ab.lastReportedAt && (
                <div className="flex items-center gap-1.5 col-span-2">
                  <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Último reporte {formatDistanceToNow(new Date(ab.lastReportedAt), { addSuffix: true })}
                  </span>
                </div>
              )}
              {ab.hostnames.length > 0 && (
                <div className="flex items-start gap-1.5 col-span-2">
                  <Server className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="font-mono text-[10px] text-muted-foreground">{ab.hostnames.join(", ")}</span>
                </div>
              )}
            </div>

            {/* Privacy/threat flags */}
            {privacyFlags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {privacyFlags.map(f => <Tag key={f.label} label={f.label} variant={f.v} />)}
              </div>
            )}

            {/* Recent reports */}
            {ab.reports.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3 text-muted-foreground" />
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Reportes recientes ({ab.reports.length})
                  </p>
                </div>
                <div className="space-y-1.5">
                  {visibleReports.map((r, i) => <ReportRow key={i} report={r} />)}
                </div>
                {ab.reports.length > 3 && (
                  <button
                    onClick={() => setShowAllReports(p => !p)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showAllReports
                      ? <><ChevronUp className="h-3 w-3" />Ver menos</>
                      : <><ChevronDown className="h-3 w-3" />Ver {ab.reports.length - 3} más</>}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ipinfo ── */}
        {info && (
          <div className="p-4 space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">ipinfo.io</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {info.org && (
                <div className="flex items-start gap-1.5 col-span-2">
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
                <div className="flex items-center gap-1.5 col-span-2">
                  <Server className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-[10px] text-muted-foreground">{info.hostname}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
