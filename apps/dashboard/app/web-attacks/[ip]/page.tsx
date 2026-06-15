import { notFound } from "next/navigation"
import { PageShell } from "@/components/page-shell"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ArrowLeft, Globe, Clock, MousePointerClick, Shield, Target, Fingerprint, GitBranch, AlertTriangle } from "lucide-react"
import { fetchWebHitsByIpPage, fetchWebHits, fetchThreat } from "@/lib/api"
import { lookupIp } from "@/lib/geo"
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
      }
    } else {
      groupMap.set(key, {
        method: hit.method, path: fullPath, attackType: hit.attackType,
        count: 1, lastSeen: hit.timestamp, galahFailures: isGalahFail, canary: isCanary,
        sampleBody: hit.body ?? "", sampleHeaders: hit.headers ?? null, sampleUserAgent: hit.userAgent,
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
              <p className="mt-1 text-xs text-muted-foreground">
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
        {(fingerprint || chainHits > 0 || canaryHits > 0) && (
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
            </div>
          </Surface>
        )}

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
