import { notFound } from "next/navigation"
import { PageShell } from "@/components/page-shell"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ArrowLeft, Globe, Clock, MousePointerClick, Shield, Target, Fingerprint, GitBranch, Link2 } from "lucide-react"
import { fetchWebHitsByIpPage, fetchWebHits, fetchThreat } from "@/lib/api"
import { lookupIp } from "@/lib/geo"
import { enrichIp } from "@/lib/ip-enrichment"
import { RiskBadge } from "@/components/risk-badge"
import { Flag } from "@/components/ui/flag"
import { ATTACK_COLORS, ATTACK_LABELS_LONG as ATTACK_LABELS } from "@/lib/attack-types"
import { StatCard } from "@/components/stat-card"
import { Surface } from "@/components/ui/surface"
import { AttackTypeFilter } from "@/components/attack-type-filter"
import { RequestRow, type RequestGroup } from "./request-row"
import { IpBursts } from "./ip-bursts"

const VALID_ATTACK_TYPES = new Set(["sqli", "xss", "lfi", "rfi", "cmdi", "log4shell", "ssti", "xxe", "deserialization", "scanner", "info_disclosure", "recon"])

export default async function WebAttackerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ip: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const { ip } = await params
  const srcIp = decodeURIComponent(ip)
  const { type } = await searchParams
  const activeType = VALID_ATTACK_TYPES.has(type ?? "") ? type : undefined

  const [attackersPage, { hits }] = await Promise.all([
    fetchWebHitsByIpPage({ q: srcIp, pageSize: 10 }),
    fetchWebHits({ srcIp, limit: 500 }),
  ])

  const attacker = attackersPage.items.find((a) => a.srcIp === srcIp)
  if (!attacker) notFound()

  let threat = null
  try { threat = await fetchThreat(srcIp) } catch {}

  let enrichment = null
  try { enrichment = await enrichIp(srcIp) } catch {}

  const location = lookupIp(srcIp)

  // Breakdown por tipo de ataque
  const byType = hits.reduce<Record<string, number>>((acc, h) => {
    acc[h.attackType] = (acc[h.attackType] ?? 0) + 1
    return acc
  }, {})

  // Paths únicos más frecuentes
  const pathCount = hits.reduce<Record<string, number>>((acc, h) => {
    acc[h.path] = (acc[h.path] ?? 0) + 1
    return acc
  }, {})
  const topPaths = Object.entries(pathCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)

  const uniqueUAs = [...new Set(attacker.userAgents)]
  const galahFailures = hits.filter((hit) => hit.galahResult?.includes("failedResponse")).length
  const canaryHits = hits.filter((hit) => hit.canaryTriggered).length

  // Session & fingerprint data from the most recent hit that has it
  const hitsWithSession = hits.filter((h) => h.sessionHits != null)
  const latestSession   = hitsWithSession[0]
  const fingerprint     = latestSession?.clientFingerprint ?? null
  const chainHits       = hits.filter((h) => h.isChainAttack).length
  const canaryTokenTypes = [...new Set(hits.map((h) => h.canaryTokenType).filter(Boolean))]
  const maxSessionHits  = Math.max(0, ...hitsWithSession.map((h) => h.sessionHits ?? 0))
  const maxElapsed      = Math.max(0, ...hitsWithSession.map((h) => h.sessionElapsedS ?? 0))

  // Attack chain sequence — deduplicated ordered list of attack types seen in chain hits
  const attackChainSequence: string[] = []
  for (const h of hits) {
    if (h.attackChain?.length) {
      for (const t of h.attackChain) {
        if (!attackChainSequence.includes(t)) attackChainSequence.push(t)
      }
    }
  }

  // HTTP version breakdown
  const httpVersions = [...new Set(hits.map((h) => h.httpVersion).filter(Boolean))]

  // Referers seen
  const referers = [...new Set(hits.map((h) => h.referer).filter(Boolean))].slice(0, 5)

  // Group the request timeline by (method + path + type) so noisy scanners
  // (e.g. Nikto hitting one path hundreds of times) collapse into a single row
  // with a count, instead of flooding the table. Each group keeps the most
  // recent hit as a representative sample so its raw payload (body, headers) can
  // be inspected on expand. The `?type=` filter narrows the timeline to one
  // attack type without touching the attacker-wide stats.
  const filteredHits = activeType ? hits.filter((h) => h.attackType === activeType) : hits
  const groupMap = new Map<string, RequestGroup>()
  for (const hit of filteredHits) {
    const fullPath = hit.query ? `${hit.path}?${hit.query}` : hit.path
    const key = `${hit.method} ${fullPath} ${hit.attackType}`
    const existing = groupMap.get(key)
    const isGalahFail = hit.galahResult?.includes("failedResponse") ? 1 : 0
    const isCanary = Boolean(hit.canaryTriggered)
    if (existing) {
      existing.count++
      existing.galahFailures += isGalahFail
      existing.canary = existing.canary || isCanary
      if (hit.timestamp > existing.lastSeen) {
        // Keep the newest hit as the sample payload shown on expand.
        existing.lastSeen = hit.timestamp
        existing.sampleBody = hit.body ?? ""
        existing.sampleHeaders = hit.headers ?? null
        existing.sampleUserAgent = hit.userAgent
        existing.sampleReferer = hit.referer || undefined
        existing.sampleHttpVersion = hit.httpVersion || undefined
      }
    } else {
      groupMap.set(key, {
        method: hit.method, path: fullPath, attackType: hit.attackType,
        count: 1, lastSeen: hit.timestamp, galahFailures: isGalahFail, canary: isCanary,
        sampleBody: hit.body ?? "", sampleHeaders: hit.headers ?? null, sampleUserAgent: hit.userAgent,
        sampleReferer: hit.referer || undefined,
        sampleHttpVersion: hit.httpVersion || undefined,
      })
    }
  }
  const groupedHits = [...groupMap.values()].sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
  )

  return (
    <PageShell>
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/web-attacks"
            className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Web Attacks
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                {location?.country && (
                  <Flag code={location.country} className="text-3xl" />
                )}
                <h1 className="font-mono text-2xl font-semibold text-foreground">{srcIp}</h1>
              </div>
              {location?.countryName && (
                <p className="mt-0.5 text-sm text-muted-foreground">{location.countryName}</p>
              )}
              <p suppressHydrationWarning className="mt-1 text-xs text-muted-foreground">
                First hit {formatDistanceToNow(new Date(attacker.firstSeen), { addSuffix: true })} ·{" "}
                Last {formatDistanceToNow(new Date(attacker.lastSeen), { addSuffix: true })}
              </p>
            </div>
            <div className="flex flex-wrap justify-end items-center gap-1.5">
              {canaryHits > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-400">
                  <Target className="h-3 w-3" /> Canary ×{canaryHits}
                </span>
              )}
              {threat && <RiskBadge level={threat.risk.level} score={threat.risk.score} ip={srcIp} />}
              {attacker.attackTypes.map((t) => (
                <span
                  key={t}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${ATTACK_COLORS[t] ?? ATTACK_COLORS.recon}`}
                >
                  {ATTACK_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={MousePointerClick} label="Total hits" value={attacker.totalHits.toLocaleString('en-US')} color="text-warning" bg="bg-warning/20" />
          <StatCard icon={Shield} label="Attack types" value={attacker.attackTypes.length} />
          <StatCard icon={Globe} label="Unique paths" value={Object.keys(pathCount).length} />
          {canaryHits > 0 ? (
            <StatCard icon={Target} label="Canary hits" value={canaryHits} color="text-red-400" bg="bg-red-500/20" />
          ) : (
            <StatCard icon={Clock} label={galahFailures > 0 ? "Galah failures" : "Campaign duration"} value={galahFailures > 0 ? galahFailures : (() => {
              const ms = new Date(attacker.lastSeen).getTime() - new Date(attacker.firstSeen).getTime()
              const h = Math.floor(ms / 3_600_000)
              const m = Math.floor((ms % 3_600_000) / 60_000)
              return h > 0 ? `${h}h ${m}m` : `${m}m`
            })()} />
          )}
        </div>

        {/* Session intelligence panel — only shown when sensor sends session data */}
        {(fingerprint || chainHits > 0 || canaryHits > 0 || attackChainSequence.length > 0 || httpVersions.length > 0 || referers.length > 0) && (
          <Surface className="mb-6 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              {/* Fingerprint */}
              {fingerprint && (
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
                    <Fingerprint className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Passive fingerprint</p>
                    <p className="font-mono text-sm text-foreground">{fingerprint}</p>
                    <Link
                      href={`/web-attacks/sessions?range=30d`}
                      className="text-xs text-blue-400 hover:underline"
                    >
                      Find other IPs with same fingerprint →
                    </Link>
                  </div>
                </div>
              )}

              {/* Chain attacks */}
              {chainHits > 0 && (
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/15">
                    <GitBranch className="h-4 w-4 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Chain attacks detected</p>
                    <p className="text-sm font-semibold text-orange-400">{chainHits} recon → exploit transitions</p>
                    <p className="text-xs text-muted-foreground">Attacker did reconnaissance before escalating</p>
                  </div>
                </div>
              )}

              {/* Canary token type */}
              {canaryHits > 0 && canaryTokenTypes.length > 0 && (
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15">
                    <Target className="h-4 w-4 text-red-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Canary token type</p>
                    {canaryTokenTypes.includes("ip_specific") ? (
                      <>
                        <p className="text-sm font-semibold text-red-400">IP-specific token reused</p>
                        <p className="text-xs text-muted-foreground">Attacker read the leaked .env and replayed the unique credential assigned to their IP</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-red-400">Static token reused</p>
                        <p className="text-xs text-muted-foreground">Attacker replayed the default leaked credential</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Session size */}
              {maxSessionHits > 0 && (
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Longest session</p>
                    <p className="text-sm font-semibold text-foreground">{maxSessionHits} hits</p>
                    <p className="text-xs text-muted-foreground">
                      over {maxElapsed >= 60
                        ? `${Math.floor(maxElapsed / 60)}m ${Math.round(maxElapsed % 60)}s`
                        : `${Math.round(maxElapsed)}s`}
                    </p>
                  </div>
                </div>
              )}

              {/* Attack chain sequence */}
              {attackChainSequence.length > 1 && (
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/15">
                    <GitBranch className="h-4 w-4 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Attack sequence</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {attackChainSequence.map((t, i) => (
                        <span key={t} className="flex items-center gap-1">
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium ${ATTACK_COLORS[t] ?? ATTACK_COLORS.recon}`}>
                            {ATTACK_LABELS[t] ?? t}
                          </span>
                          {i < attackChainSequence.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* HTTP version + referers */}
              {(httpVersions.length > 0 || referers.length > 0) && (
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    {httpVersions.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">HTTP version</p>
                        <p className="font-mono text-sm text-foreground">{httpVersions.join(", ")}</p>
                      </div>
                    )}
                    {referers.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Referers</p>
                        {referers.map((r) => (
                          <p key={r} className="truncate font-mono text-xs text-muted-foreground" title={r}>{r}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Surface>
        )}

        {/* Threat Intelligence panel */}
        {enrichment && (enrichment.abuseipdb || enrichment.ipinfo || enrichment.virustotal) && (() => {
          const abuse = enrichment.abuseipdb
          const info  = enrichment.ipinfo
          const vt    = enrichment.virustotal
          const vtStats = vt?.last_analysis_stats
          const vtTotal = vtStats ? vtStats.malicious + vtStats.suspicious + vtStats.undetected + vtStats.harmless + vtStats.timeout : 0
          const networkOrg  = info?.org  || abuse?.isp  || null
          const networkAsn  = info?.asn  || (vt?.asn ? `AS${vt.asn}` : null)
          const networkHost = info?.hostname || null
          const abuseScore  = abuse?.abuseConfidenceScore ?? 0
          const scoreColor  = abuseScore >= 80 ? "text-red-400" : abuseScore >= 40 ? "text-amber-400" : "text-green-400"
          const scoreBg     = abuseScore >= 80 ? "bg-red-500/10 border-red-500/20" : abuseScore >= 40 ? "bg-amber-500/10 border-amber-500/20" : "bg-green-500/10 border-green-500/20"

          return (
            <Surface className="mb-6 overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h3 className="font-semibold text-foreground">Threat Intelligence</h3>
                <p className="text-xs text-muted-foreground">
                  {[abuse && "AbuseIPDB", info && "IPInfo", vt && "VirusTotal"].filter(Boolean).join(" · ")}
                  {" · "}
                  <span suppressHydrationWarning>cached {formatDistanceToNow(new Date(enrichment.cachedAt), { addSuffix: true })}</span>
                </p>
              </div>

              <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">

                {/* ── Column 1: AbuseIPDB ── */}
                <div className="p-4 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">AbuseIPDB</p>
                  {abuse ? (
                    <>
                      {/* Score gauge */}
                      <div className={`inline-flex items-end gap-2 rounded-lg border px-3 py-2 ${scoreBg}`}>
                        <span className={`text-4xl font-black leading-none ${scoreColor}`}>{abuseScore}%</span>
                        <span className="mb-0.5 text-xs text-muted-foreground">confidence</span>
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md bg-muted/30 px-2 py-1.5">
                          <p className="text-muted-foreground">Reports</p>
                          <p className="font-semibold text-foreground">{abuse.totalReports.toLocaleString('en-US')}</p>
                        </div>
                        <div className="rounded-md bg-muted/30 px-2 py-1.5">
                          <p className="text-muted-foreground">Distinct users</p>
                          <p className="font-semibold text-foreground">{abuse.numDistinctUsers.toLocaleString('en-US')}</p>
                        </div>
                        {abuse.usageType && (
                          <div className="col-span-2 rounded-md bg-muted/30 px-2 py-1.5">
                            <p className="text-muted-foreground">Usage type</p>
                            <p className="font-semibold text-foreground">{abuse.usageType}</p>
                          </div>
                        )}
                      </div>

                      {/* Flags */}
                      <div className="flex flex-wrap gap-1">
                        {abuse.isTor         && <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">Tor exit node</span>}
                        {abuse.isVpn         && <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">VPN</span>}
                        {abuse.isWhitelisted && <span className="inline-flex items-center rounded-full border border-green-500/40 bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-400">Whitelisted</span>}
                      </div>

                      {/* Last reported */}
                      {abuse.lastReportedAt && (
                        <p suppressHydrationWarning className="text-xs text-muted-foreground">
                          Last reported {formatDistanceToNow(new Date(abuse.lastReportedAt), { addSuffix: true })}
                        </p>
                      )}

                      {/* Recent reports */}
                      {abuse.reports.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Recent reports</p>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {abuse.reports.slice(0, 5).map((r, i) => (
                              <div key={i} className="rounded-md bg-muted/20 px-2 py-1.5 text-xs">
                                <p suppressHydrationWarning className="text-muted-foreground text-[10px]">
                                  {formatDistanceToNow(new Date(r.reportedAt), { addSuffix: true })} · {r.reporterCountryName || r.reporterCountryCode}
                                </p>
                                {r.comment && <p className="mt-0.5 text-foreground line-clamp-2">{r.comment}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No AbuseIPDB data</p>
                  )}
                </div>

                {/* ── Column 2: Network / IPInfo ── */}
                <div className="p-4 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Network</p>

                  {/* Org + ASN */}
                  {networkOrg && <p className="text-sm font-semibold text-foreground">{networkOrg}</p>}
                  {networkAsn && <p className="font-mono text-xs text-muted-foreground">{networkAsn}{vt?.as_owner && vt.as_owner !== networkOrg ? ` · ${vt.as_owner}` : ""}</p>}
                  {vt?.network && <p className="font-mono text-[10px] text-muted-foreground">{vt.network}</p>}
                  {networkHost && <p className="font-mono text-xs text-muted-foreground break-all">{networkHost}</p>}

                  {/* Location */}
                  {(info?.city || info?.region || info?.country || vt?.country) && (
                    <div className="rounded-md bg-muted/30 px-2 py-1.5 text-xs">
                      <p className="text-muted-foreground">Location</p>
                      <p className="font-semibold text-foreground">
                        {[info?.city, info?.region, info?.country || vt?.country].filter(Boolean).join(", ")}
                      </p>
                      {info?.timezone && <p className="text-muted-foreground">{info.timezone}</p>}
                    </div>
                  )}

                  {/* Privacy flags */}
                  {info && (
                    <div className="flex flex-wrap gap-1">
                      {info.isHosting && <span className="inline-flex items-center rounded-full border border-blue-500/40 bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-400">Hosting / DC</span>}
                      {info.isVpn     && <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">VPN</span>}
                      {info.isTor     && <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">Tor</span>}
                      {info.isProxy   && <span className="inline-flex items-center rounded-full border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-400">Proxy</span>}
                      {!info.isHosting && !info.isVpn && !info.isTor && !info.isProxy && (
                        <span className="inline-flex items-center rounded-full border border-muted px-2 py-0.5 text-[10px] text-muted-foreground">Residential</span>
                      )}
                    </div>
                  )}

                  {/* Domain info from AbuseIPDB */}
                  {abuse?.domain && (
                    <div className="rounded-md bg-muted/30 px-2 py-1.5 text-xs">
                      <p className="text-muted-foreground">Domain</p>
                      <p className="font-mono font-semibold text-foreground">{abuse.domain}</p>
                    </div>
                  )}

                  {/* Hostnames */}
                  {(abuse?.hostnames?.length ?? 0) > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Hostnames</p>
                      {abuse!.hostnames.slice(0, 4).map((h) => (
                        <p key={h} className="truncate font-mono text-xs text-muted-foreground">{h}</p>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Column 3: VirusTotal ── */}
                <div className="p-4 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">VirusTotal</p>
                  {vt && vtStats ? (
                    <>
                      {/* Detection bar */}
                      <div>
                        <div className="mb-1 flex items-end justify-between">
                          <span className={`text-3xl font-black leading-none ${vtStats.malicious > 0 ? "text-red-400" : "text-green-400"}`}>
                            {vtStats.malicious}
                          </span>
                          <span className="text-xs text-muted-foreground">/ {vtTotal} engines</span>
                        </div>
                        {vtTotal > 0 && (
                          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                            {vtStats.malicious  > 0 && <div className="bg-red-500"    style={{ width: `${vtStats.malicious  / vtTotal * 100}%` }} />}
                            {vtStats.suspicious > 0 && <div className="bg-amber-500"  style={{ width: `${vtStats.suspicious / vtTotal * 100}%` }} />}
                            {vtStats.harmless   > 0 && <div className="bg-green-500"  style={{ width: `${vtStats.harmless   / vtTotal * 100}%` }} />}
                            {vtStats.undetected > 0 && <div className="bg-muted-foreground/30" style={{ width: `${vtStats.undetected / vtTotal * 100}%` }} />}
                          </div>
                        )}
                        <div className="mt-1 grid grid-cols-2 gap-x-2 text-[10px] text-muted-foreground">
                          <span><span className="text-red-400">■</span> {vtStats.malicious} malicious</span>
                          <span><span className="text-amber-400">■</span> {vtStats.suspicious} suspicious</span>
                          <span><span className="text-green-400">■</span> {vtStats.harmless} harmless</span>
                          <span><span className="text-muted-foreground/50">■</span> {vtStats.undetected} undetected</span>
                        </div>
                      </div>

                      {/* Reputation + votes */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md bg-muted/30 px-2 py-1.5">
                          <p className="text-muted-foreground">Reputation</p>
                          <p className={`font-semibold ${vt.reputation < 0 ? "text-red-400" : vt.reputation > 0 ? "text-green-400" : "text-foreground"}`}>
                            {vt.reputation > 0 ? `+${vt.reputation}` : vt.reputation}
                          </p>
                        </div>
                        <div className="rounded-md bg-muted/30 px-2 py-1.5">
                          <p className="text-muted-foreground">Community votes</p>
                          <p className="text-xs text-foreground">
                            <span className="text-red-400">{vt.total_votes.malicious}✗</span>
                            {" / "}
                            <span className="text-green-400">{vt.total_votes.harmless}✓</span>
                          </p>
                        </div>
                      </div>

                      {/* Tags */}
                      {vt.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {vt.tags.map((tag) => (
                            <span key={tag} className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                          ))}
                        </div>
                      )}

                      {/* Last analysis date */}
                      {vt.last_analysis_date && (
                        <p suppressHydrationWarning className="text-xs text-muted-foreground">
                          Last analyzed {formatDistanceToNow(new Date(vt.last_analysis_date * 1000), { addSuffix: true })}
                        </p>
                      )}

                      {/* TLS cert */}
                      {vt.last_https_certificate?.subject?.CN && (
                        <div className="rounded-md bg-muted/30 px-2 py-1.5 text-xs">
                          <p className="text-muted-foreground">TLS certificate</p>
                          <p className="font-mono text-foreground">{vt.last_https_certificate.subject.CN}</p>
                          {vt.last_https_certificate.issuer?.O && (
                            <p className="text-muted-foreground">{vt.last_https_certificate.issuer.O}</p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No VirusTotal data</p>
                  )}
                </div>
              </div>
            </Surface>
          )
        })()}

        <div className="grid gap-6 xl:grid-cols-3">
          {/* Left column */}
          <div className="space-y-6 xl:col-span-1">
            {/* Attack bursts (time-grouped campaigns) */}
            <IpBursts hits={hits} />

            {/* Attack type breakdown */}
            <Surface>
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Breakdown by type</h3>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-border">
                {Object.entries(byType)
                  .sort((a, b) => b[1] - a[1])
                  .map(([t, count]) => (
                    <div key={t} className="flex items-center justify-between px-4 py-2.5">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ATTACK_COLORS[t] ?? ATTACK_COLORS.recon}`}>
                        {ATTACK_LABELS[t] ?? t}
                      </span>
                      <span className="font-mono text-sm font-semibold text-foreground">{count}</span>
                    </div>
                  ))}
              </div>
            </Surface>

            {/* User agents */}
            {uniqueUAs.length > 0 && (
              <Surface>
                <div className="border-b border-border p-4">
                  <h3 className="font-semibold text-foreground">User Agents</h3>
                  <p className="text-xs text-muted-foreground">{uniqueUAs.length} detected</p>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-border">
                  {uniqueUAs.map((ua, i) => (
                    <p key={i} className="px-4 py-2.5 font-mono text-xs text-muted-foreground break-all">
                      {ua}
                    </p>
                  ))}
                </div>
              </Surface>
            )}

            {/* Top paths */}
            <Surface>
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Most attacked paths</h3>
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-border">
                {topPaths.map(([path, count]) => (
                  <div key={path} className="flex items-center justify-between gap-2 px-4 py-2">
                    <p className="min-w-0 truncate font-mono text-xs text-foreground" title={path}>{path}</p>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">×{count}</span>
                  </div>
                ))}
              </div>
            </Surface>
          </div>

          {/* Right column: hit timeline */}
          <div className="xl:col-span-2">
            <Surface className="overflow-hidden">
              <div className="border-b border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground">Request timeline</h3>
                    <p className="text-xs text-muted-foreground">
                      {groupedHits.length} unique requests · {filteredHits.length} hits
                      {activeType ? ` · filtered by ${ATTACK_LABELS[activeType] ?? activeType}` : ""}
                      {" · click a row for the raw payload"}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <AttackTypeFilter types={Object.keys(byType)} counts={byType} />
                </div>
              </div>
              <div className="overflow-y-auto max-h-[620px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border">
                    <th className="w-6 px-2 py-2.5"></th>
                    <th className="px-2 py-2.5 text-left font-medium text-muted-foreground">Method</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Path</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Count</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {groupedHits.map((g) => (
                    <RequestRow key={`${g.method} ${g.path} ${g.attackType}`} group={g} />
                  ))}
                  {groupedHits.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        No requests of this type.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </Surface>
          </div>
        </div>
  </PageShell>
  )
}
