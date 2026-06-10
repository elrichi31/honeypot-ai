"use client"

import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  Flag,
  Globe,
  Hash,
  Loader2,
  MapPin,
  MessageSquare,
  Server,
  ShieldCheck,
} from "lucide-react"
import type { AbuseReport, IpEnrichment } from "@/app/api/enrich/[ip]/route"
import { Surface } from "@/components/ui/surface"

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
  if (score > 0) return "text-yellow-400"
  return "text-success"
}

function Tag({ label, variant = "neutral" }: { label: string; variant?: "danger" | "warn" | "neutral" }) {
  const cls = variant === "danger"
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : variant === "warn"
    ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
    : "border-border bg-secondary text-muted-foreground"

  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>
}

function ReportRow({ report }: { report: AbuseReport }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-secondary/30 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(new Date(report.reportedAt), { addSuffix: true })}
          {report.reporterCountryName ? ` · ${report.reporterCountryName}` : ""}
        </span>
        <div className="flex flex-wrap justify-end gap-1">
          {report.categories.map((c) => (
            <span key={c} className="rounded border border-border bg-secondary px-1.5 py-0 text-[9px] text-muted-foreground">
              {ABUSE_CATEGORIES[c] ?? `Cat ${c}`}
            </span>
          ))}
        </div>
      </div>
      {report.comment && <p className="line-clamp-2 text-[11px] leading-relaxed text-foreground">{report.comment}</p>}
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
      .then((r) => r.json())
      .then((d: IpEnrichment) => {
        if (d.abuseipdb || d.ipinfo || d.spectraAnalyze) setData(d)
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
      <Surface padded className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Querying intelligence feeds...
      </Surface>
    )
  }

  if (!data) {
    if (!autoFetch) {
      return (
        <Surface className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <span>IP Enrichment - no cached data</span>
          </div>
          <button onClick={doFetch} className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/80">
            Query now
          </button>
        </Surface>
      )
    }
    return null
  }

  const ab = data.abuseipdb
  const info = data.ipinfo
  const spectra = data.spectraAnalyze

  const privacyFlags = [
    ab?.isTor && { label: "Tor Exit", v: "danger" as const },
    ab?.isVpn && { label: "VPN (AbuseIPDB)", v: "warn" as const },
    info?.isTor && !ab?.isTor && { label: "Tor", v: "danger" as const },
    info?.isVpn && !ab?.isVpn && { label: "VPN", v: "warn" as const },
    info?.isProxy && { label: "Proxy", v: "warn" as const },
    info?.isHosting && { label: "Hosting/DC", v: "neutral" as const },
  ].filter(Boolean) as { label: string; v: "danger" | "warn" | "neutral" }[]

  const visibleReports = showAllReports ? (ab?.reports ?? []) : (ab?.reports ?? []).slice(0, 3)
  const spectraStats = spectra?.third_party_reputations?.statistics
  const spectraDownloaded = spectra?.downloaded_files_statistics
  const spectraSources = (spectra?.third_party_reputations?.sources ?? []).slice(0, 5)
  const spectraThreats = (spectra?.top_threats ?? []).slice(0, 5)

  return (
    <Surface className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
          <h3 className="font-semibold text-foreground">IP Enrichment</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          updated {formatDistanceToNow(new Date(data.cachedAt), { addSuffix: true })}
        </span>
      </div>

      <div className="divide-y divide-border">
        {ab && (
          <div className="space-y-4 p-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">AbuseIPDB</p>

            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <span className={`text-4xl font-bold tabular-nums ${ABUSE_COLOR(ab.abuseConfidenceScore)}`}>
                  {ab.abuseConfidenceScore}%
                </span>
                <span className="ml-2 text-xs text-muted-foreground">abuse confidence</span>
              </div>
              <div className="flex gap-4 text-xs">
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">{ab.totalReports.toLocaleString("en-US")}</p>
                  <p className="text-muted-foreground">reports</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">{ab.numDistinctUsers.toLocaleString("en-US")}</p>
                  <p className="text-muted-foreground">distinct users</p>
                </div>
              </div>
            </div>

            {ab.abuseConfidenceScore >= 80 && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                <span className="text-xs font-medium text-destructive">IP widely reported as malicious</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {ab.isp && (
                <div className="col-span-2 flex items-center gap-1.5">
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
                <div className="col-span-2 flex items-center gap-1.5">
                  <Server className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{ab.usageType}</span>
                </div>
              )}
              {ab.lastReportedAt && (
                <div className="col-span-2 flex items-center gap-1.5">
                  <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Last reported {formatDistanceToNow(new Date(ab.lastReportedAt), { addSuffix: true })}
                  </span>
                </div>
              )}
              {ab.hostnames.length > 0 && (
                <div className="col-span-2 flex items-start gap-1.5">
                  <Server className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="font-mono text-[10px] text-muted-foreground">{ab.hostnames.join(", ")}</span>
                </div>
              )}
            </div>

            {privacyFlags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {privacyFlags.map((f) => <Tag key={f.label} label={f.label} variant={f.v} />)}
              </div>
            )}

            {ab.reports.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3 text-muted-foreground" />
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Recent reports ({ab.reports.length})
                  </p>
                </div>
                <div className="space-y-1.5">
                  {visibleReports.map((r, i) => <ReportRow key={i} report={r} />)}
                </div>
                {ab.reports.length > 3 && (
                  <button onClick={() => setShowAllReports((p) => !p)} className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                    {showAllReports
                      ? <><ChevronUp className="h-3 w-3" />Show less</>
                      : <><ChevronDown className="h-3 w-3" />Show {ab.reports.length - 3} more</>}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {spectra && (
          <div className="space-y-4 p-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Spectra Analyze</p>

            {(spectraStats || spectraDownloaded) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {spectraStats && (
                  <div className="rounded-lg border border-border bg-secondary/30 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">3rd-party reputation</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <span className="text-foreground">Total <span className="font-mono">{spectraStats.total ?? 0}</span></span>
                      <span className="text-destructive">Malicious <span className="font-mono">{spectraStats.malicious ?? 0}</span></span>
                      <span className="text-success">Clean <span className="font-mono">{spectraStats.clean ?? 0}</span></span>
                    </div>
                  </div>
                )}
                {spectraDownloaded && (
                  <div className="rounded-lg border border-border bg-secondary/30 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Downloaded files</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <span className="text-foreground">Total <span className="font-mono">{spectraDownloaded.total ?? 0}</span></span>
                      <span className="text-destructive">Malicious <span className="font-mono">{spectraDownloaded.malicious ?? 0}</span></span>
                      <span className="text-warning">Suspicious <span className="font-mono">{spectraDownloaded.suspicious ?? 0}</span></span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {spectraThreats.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Top threats</p>
                <div className="flex flex-wrap gap-1.5">
                  {spectraThreats.map((threat, idx) => {
                    const label = threat.threat_name || threat.malware_family || threat.malware_type || threat.sample_type || "Unknown"
                    return <Tag key={`${label}-${idx}`} label={label} variant="warn" />
                  })}
                </div>
              </div>
            )}

            {spectraSources.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Detections</p>
                <div className="space-y-1.5">
                  {spectraSources.map((source, idx) => (
                    <div key={`${source.source ?? "src"}-${idx}`} className="rounded-lg border border-border bg-secondary/20 p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{source.source ?? "Unknown source"}</span>
                        <span className="text-muted-foreground">{source.detection ?? "undetected"}</span>
                      </div>
                      {source.category && <p className="mt-1 text-muted-foreground">{source.category}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {spectra.modified_time && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                <span>Report updated {formatDistanceToNow(new Date(spectra.modified_time), { addSuffix: true })}</span>
              </div>
            )}
          </div>
        )}

        {info && (
          <div className="space-y-3 p-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">ipinfo.io</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {info.org && (
                <div className="col-span-2 flex items-start gap-1.5">
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
                <div className="col-span-2 flex items-center gap-1.5">
                  <Server className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-[10px] text-muted-foreground">{info.hostname}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Surface>
  )
}
