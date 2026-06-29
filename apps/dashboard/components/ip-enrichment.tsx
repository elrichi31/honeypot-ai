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
  ShieldAlert,
  Network,
  Key,
  FileText,
  CheckCircle2,
  Calendar,
} from "lucide-react"
import type { AbuseReport, IpEnrichment } from "@/app/api/enrich/[ip]/route"
import type { VtIpData } from "@/lib/virustotal"
import { Surface } from "@/components/ui/surface"
import { Flag as CountryFlag } from "@/components/ui/flag"

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

function VtDetectionBar({ stats }: { stats: VtIpData["last_analysis_stats"] }) {
  const total = stats.malicious + stats.suspicious + stats.undetected + stats.harmless + stats.timeout
  if (total === 0) return null
  const malPct  = Math.round((stats.malicious  / total) * 100)
  const susPct  = Math.round((stats.suspicious / total) * 100)
  const harmPct = Math.round((stats.harmless   / total) * 100)
  const undetPct = Math.round((stats.undetected / total) * 100)

  return (
    <div className="space-y-1">
      <div className="flex h-2 overflow-hidden rounded-full bg-border">
        {stats.malicious  > 0 && <div className="bg-destructive"     style={{ width: `${malPct}%` }} />}
        {stats.suspicious > 0 && <div className="bg-warning"         style={{ width: `${susPct}%` }} />}
        {stats.harmless   > 0 && <div className="bg-success"         style={{ width: `${harmPct}%` }} />}
        {stats.undetected > 0 && <div className="bg-muted-foreground/30" style={{ width: `${undetPct}%` }} />}
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-destructive" />{stats.malicious} malicious</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-warning" />{stats.suspicious} suspicious</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-success" />{stats.harmless} harmless</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30" />{stats.undetected} undetected</span>
        {stats.timeout > 0 && <span>{stats.timeout} timeout</span>}
      </div>
    </div>
  )
}

function WhoisBlock({ whois, whoisDate }: { whois: string; whoisDate: number | null }) {
  const [expanded, setExpanded] = useState(false)
  const lines = whois.trim().split("\n")
  const preview = lines.slice(0, 8)
  const hasMore = lines.length > 8
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            WHOIS{whoisDate ? ` · ${formatDistanceToNow(new Date(whoisDate * 1000), { addSuffix: true })}` : ""}
          </p>
        </div>
        {hasMore && (
          <button onClick={() => setExpanded((p) => !p)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? <><ChevronUp className="h-3 w-3" />Less</> : <><ChevronDown className="h-3 w-3" />Full WHOIS</>}
          </button>
        )}
      </div>
      <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-secondary/20 p-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
        {(expanded ? lines : preview).join("\n")}
        {!expanded && hasMore && "\n…"}
      </pre>
    </div>
  )
}

function VtIpSection({ vt }: { vt: VtIpData }) {
  const [showEngines, setShowEngines] = useState(false)
  const maliciousEngines = Object.entries(vt.last_analysis_results)
    .filter(([, r]) => r.category === "malicious" || r.category === "suspicious")
    .sort((a, b) => (a[1].category === "malicious" ? -1 : 1) - (b[1].category === "malicious" ? -1 : 1))
  const totalEngines = Object.keys(vt.last_analysis_results).length
  const score = vt.last_analysis_stats.malicious
  const scoreColor = score >= 5 ? "text-destructive" : score >= 1 ? "text-warning" : "text-success"

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <span className={`text-4xl font-bold tabular-nums ${scoreColor}`}>{score}</span>
          <span className="ml-1 text-xs text-muted-foreground">/ {totalEngines} engines</span>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">{vt.reputation}</p>
            <p className="text-muted-foreground">reputation</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-destructive">{vt.total_votes.malicious}</p>
            <p className="text-muted-foreground">votes malicious</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-success">{vt.total_votes.harmless}</p>
            <p className="text-muted-foreground">votes harmless</p>
          </div>
        </div>
      </div>

      {/* Detection bar */}
      <VtDetectionBar stats={vt.last_analysis_stats} />

      {/* Alert when flagged */}
      {score >= 3 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="text-xs font-medium text-destructive">Flagged by {score} security vendors</span>
        </div>
      )}

      {/* Network info */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {vt.as_owner && (
          <div className="col-span-2 flex items-center gap-1.5">
            <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="font-medium text-foreground">{vt.as_owner}</span>
            {vt.asn !== null && <span className="font-mono text-muted-foreground">(AS{vt.asn})</span>}
          </div>
        )}
        {vt.network && (
          <div className="flex items-center gap-1.5">
            <Network className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="font-mono text-muted-foreground">{vt.network}</span>
          </div>
        )}
        {vt.country && (
          <div className="flex items-center gap-1.5">
            <CountryFlag code={vt.country} />
            <span className="text-muted-foreground">{vt.country}{vt.continent ? ` · ${vt.continent}` : ""}</span>
          </div>
        )}
        {vt.regional_internet_registry && (
          <div className="flex items-center gap-1.5">
            <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">{vt.regional_internet_registry}</span>
          </div>
        )}
        {vt.jarm && (
          <div className="col-span-2 flex items-center gap-1.5">
            <Key className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="font-mono text-[10px] text-muted-foreground">JARM {vt.jarm.slice(0, 24)}…</span>
          </div>
        )}
        {vt.last_analysis_date && (
          <div className="col-span-2 flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
              Last scanned {formatDistanceToNow(new Date(vt.last_analysis_date * 1000), { addSuffix: true })}
            </span>
          </div>
        )}
      </div>

      {/* Tags */}
      {vt.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {vt.tags.map((tag) => <Tag key={tag} label={tag} variant="warn" />)}
        </div>
      )}

      {/* TLS cert */}
      {vt.last_https_certificate && (
        <div className="rounded-lg border border-border bg-secondary/20 p-2.5 text-xs space-y-0.5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">TLS Certificate</p>
          {vt.last_https_certificate.subject?.CN && (
            <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">CN</span><span className="font-mono text-foreground truncate">{vt.last_https_certificate.subject.CN}</span></div>
          )}
          {vt.last_https_certificate.subject?.O && (
            <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">Org</span><span className="text-foreground">{vt.last_https_certificate.subject.O}</span></div>
          )}
          {vt.last_https_certificate.subject?.C && (
            <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">Country</span><span className="text-muted-foreground">{vt.last_https_certificate.subject.C}</span></div>
          )}
          {vt.last_https_certificate.issuer?.CN && (
            <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">Issuer</span><span className="text-foreground">{vt.last_https_certificate.issuer.CN}</span></div>
          )}
          {vt.last_https_certificate.issuer?.O && (
            <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">Issuer Org</span><span className="text-muted-foreground">{vt.last_https_certificate.issuer.O}</span></div>
          )}
          {vt.last_https_certificate.validity?.not_before && (
            <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">Valid from</span><span className="text-muted-foreground">{vt.last_https_certificate.validity.not_before}</span></div>
          )}
          {vt.last_https_certificate.validity?.not_after && (
            <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">Expires</span><span className="text-muted-foreground">{vt.last_https_certificate.validity.not_after}</span></div>
          )}
          {vt.last_https_certificate.serial_number && (
            <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">Serial</span><span className="font-mono text-[10px] text-muted-foreground break-all">{vt.last_https_certificate.serial_number}</span></div>
          )}
          {vt.last_https_certificate.thumbprint && (
            <div className="flex gap-2"><span className="text-muted-foreground w-14 shrink-0">SHA1</span><span className="font-mono text-[10px] text-muted-foreground break-all">{vt.last_https_certificate.thumbprint}</span></div>
          )}
        </div>
      )}

      {/* Malicious/suspicious engines */}
      {maliciousEngines.length > 0 && (
        <div className="space-y-2">
          <button onClick={() => setShowEngines((p) => !p)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            {showEngines ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {maliciousEngines.length} engine{maliciousEngines.length > 1 ? "s" : ""} flagged this IP
          </button>
          {showEngines && (
            <div className="space-y-1">
              {maliciousEngines.map(([name, r]) => (
                <div key={name} className="flex items-center justify-between rounded border border-border bg-secondary/20 px-2.5 py-1.5 text-xs">
                  <span className="font-medium text-foreground">{r.engine_name}</span>
                  <div className="flex items-center gap-2">
                    {r.result && <span className="font-mono text-[10px] text-muted-foreground">{r.result}</span>}
                    <span className={r.category === "malicious" ? "text-destructive" : "text-warning"}>{r.category}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All engines summary (harmless/undetected count) */}
      {totalEngines > 0 && (
        <div className="text-[10px] text-muted-foreground">
          {totalEngines} engines scanned · {vt.last_analysis_stats.harmless} harmless · {vt.last_analysis_stats.undetected} undetected
          {vt.last_analysis_stats.timeout > 0 && ` · ${vt.last_analysis_stats.timeout} timeout`}
        </div>
      )}

      {/* WHOIS */}
      {vt.whois && (
        <WhoisBlock whois={vt.whois} whoisDate={vt.whois_date} />
      )}

      {/* Certificate date + last modification */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        {vt.last_https_certificate_date && (
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>Cert captured {formatDistanceToNow(new Date(vt.last_https_certificate_date * 1000), { addSuffix: true })}</span>
          </div>
        )}
        {vt.last_modification_date && (
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>VT record updated {formatDistanceToNow(new Date(vt.last_modification_date * 1000), { addSuffix: true })}</span>
          </div>
        )}
      </div>
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
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: IpEnrichment) => {
        if (d.abuseipdb || d.ipinfo || d.spectraAnalyze || d.virustotal) setData(d)
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
  const vt = data.virustotal as VtIpData | null

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
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
          <h3 className="font-semibold text-foreground">Threat Intelligence</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {[ab && "AbuseIPDB", info && "IPInfo", vt && "VirusTotal", spectra && "Spectra"].filter(Boolean).join(" · ")}
          {" · "}updated {formatDistanceToNow(new Date(data.cachedAt), { addSuffix: true })}
        </span>
      </div>

      {/* 2-column grid: AbuseIPDB + Network | VirusTotal */}
      <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">

        {/* ── Column 1: AbuseIPDB + Network info ── */}
        <div className="space-y-4 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">AbuseIPDB</p>
          {ab ? (
            <>
              {/* Score */}
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <div>
                  <span className={`text-4xl font-bold tabular-nums ${ABUSE_COLOR(ab.abuseConfidenceScore)}`}>
                    {ab.abuseConfidenceScore}%
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">abuse confidence</span>
                </div>
                <div className="flex gap-3 text-xs">
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

              {/* AbuseIPDB meta */}
              <div className="space-y-1.5 text-xs">
                {ab.isp && (
                  <div className="flex items-center gap-1.5">
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
                    <CountryFlag code={ab.countryCode ?? ""} />
                    <span className="text-muted-foreground">{ab.countryName}{ab.countryCode ? ` (${ab.countryCode})` : ""}</span>
                  </div>
                )}
                {ab.usageType && (
                  <div className="flex items-center gap-1.5">
                    <Server className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">{ab.usageType}</span>
                  </div>
                )}
                {ab.lastReportedAt && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">Last reported {formatDistanceToNow(new Date(ab.lastReportedAt), { addSuffix: true })}</span>
                  </div>
                )}
                {ab.hostnames.length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <Server className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-[10px] text-muted-foreground break-all">{ab.hostnames.join(", ")}</span>
                  </div>
                )}
                {ab.isWhitelisted && (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
                    <span className="text-success text-[11px]">Whitelisted by AbuseIPDB</span>
                  </div>
                )}
              </div>

              {/* Privacy + hosting flags */}
              {privacyFlags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {privacyFlags.map((f) => <Tag key={f.label} label={f.label} variant={f.v} />)}
                </div>
              )}

              {/* Recent reports */}
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
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No AbuseIPDB data</p>
          )}

          {/* ── Network / IPInfo (merged into col 1) ── */}
          {(info || vt?.asn || vt?.network) && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Network</p>
              <div className="space-y-1.5 text-xs">
                {/* Org + ASN */}
                {(info?.org) && (
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="font-medium text-foreground">{info.org}</span>
                  </div>
                )}
                {(info?.asn || vt?.asn) && (
                  <div className="flex items-center gap-1.5">
                    <Hash className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-muted-foreground">
                      {info?.asn || `AS${vt!.asn}`}
                      {vt?.as_owner && vt.as_owner !== info?.org ? ` · ${vt.as_owner}` : ""}
                    </span>
                  </div>
                )}
                {vt?.network && (
                  <div className="flex items-center gap-1.5">
                    <Network className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-[10px] text-muted-foreground">{vt.network}</span>
                  </div>
                )}
                {(info?.hostname) && (
                  <div className="flex items-center gap-1.5">
                    <Server className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-[10px] text-muted-foreground break-all">{info.hostname}</span>
                  </div>
                )}
                {/* Location */}
                {(info?.city || info?.region || info?.country || vt?.country) && (
                  <div className="rounded-md bg-muted/30 px-2 py-1.5 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <CountryFlag code={info?.country || vt?.country || ""} />
                      <span className="font-semibold text-foreground">
                        {[info?.city, info?.region, info?.country || vt?.country].filter(Boolean).join(", ")}
                        {info?.postal ? ` (${info.postal})` : ""}
                      </span>
                    </div>
                    {info?.timezone && <p className="text-muted-foreground">{info.timezone}</p>}
                    {(vt?.continent || vt?.regional_internet_registry) && (
                      <p className="text-muted-foreground">
                        {[vt.continent, vt.regional_internet_registry].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {info?.loc && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="font-mono text-[10px] text-muted-foreground">{info.loc}</span>
                        <a href={`https://maps.google.com/?q=${info.loc}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline">Maps ↗</a>
                      </div>
                    )}
                  </div>
                )}
                {/* Extra privacy flags from IPInfo not already shown above */}
                {info && (
                  <div className="flex flex-wrap gap-1">
                    {info.isTor && !ab?.isTor && <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">Tor (IPInfo)</span>}
                    {info.isVpn && !ab?.isVpn && <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">VPN (IPInfo)</span>}
                    {info.isProxy && <span className="inline-flex items-center rounded-full border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-400">Proxy</span>}
                    {info.isHosting && <span className="inline-flex items-center rounded-full border border-blue-500/40 bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-400">Hosting/DC</span>}
                  </div>
                )}
                {vt?.jarm && (
                  <div className="flex items-center gap-1.5">
                    <Key className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-[10px] text-muted-foreground">JARM {vt.jarm.slice(0, 32)}…</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Spectra Analyze (appended to col 1) ── */}
          {spectra && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Spectra Analyze</p>
              {(spectraStats || spectraDownloaded) && (
                <div className="space-y-1.5">
                  {spectraStats && (
                    <div className="rounded-md bg-muted/30 px-2 py-1.5 text-xs">
                      <p className="text-[10px] text-muted-foreground mb-1">3rd-party reputation</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-foreground">Total <span className="font-mono">{spectraStats.total ?? 0}</span></span>
                        <span className="text-destructive">Malicious <span className="font-mono">{spectraStats.malicious ?? 0}</span></span>
                        <span className="text-success">Clean <span className="font-mono">{spectraStats.clean ?? 0}</span></span>
                      </div>
                    </div>
                  )}
                  {spectraDownloaded && (
                    <div className="rounded-md bg-muted/30 px-2 py-1.5 text-xs">
                      <p className="text-[10px] text-muted-foreground mb-1">Downloaded files</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-foreground">Total <span className="font-mono">{spectraDownloaded.total ?? 0}</span></span>
                        <span className="text-destructive">Malicious <span className="font-mono">{spectraDownloaded.malicious ?? 0}</span></span>
                        <span className="text-warning">Suspicious <span className="font-mono">{spectraDownloaded.suspicious ?? 0}</span></span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {spectraThreats.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {spectraThreats.map((threat, idx) => {
                    const label = threat.threat_name || threat.malware_family || threat.malware_type || threat.sample_type || "Unknown"
                    return <Tag key={`${label}-${idx}`} label={label} variant="warn" />
                  })}
                </div>
              )}
              {spectraSources.length > 0 && (
                <div className="space-y-1">
                  {spectraSources.map((source, idx) => (
                    <div key={`${source.source ?? "src"}-${idx}`} className="rounded border border-border bg-secondary/20 px-2 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{source.source ?? "Unknown"}</span>
                        <span className="text-muted-foreground">{source.detection ?? "undetected"}</span>
                      </div>
                      {source.category && <p className="mt-0.5 text-[10px] text-muted-foreground">{source.category}</p>}
                    </div>
                  ))}
                </div>
              )}
              {spectra.modified_time && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>Updated {formatDistanceToNow(new Date(spectra.modified_time), { addSuffix: true })}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Column 2: VirusTotal ── */}
        <div className="space-y-3 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">VirusTotal</p>
          {vt ? (
            <VtIpSection vt={vt} />
          ) : (
            <p className="text-xs text-muted-foreground">No VirusTotal data</p>
          )}
        </div>
      </div>
    </Surface>
  )
}
