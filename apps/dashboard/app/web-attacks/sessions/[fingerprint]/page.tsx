import { notFound } from "next/navigation"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
  ArrowLeft, Fingerprint, GitBranch, Target, Clock, MousePointerClick,
  Globe, Shield, AlertTriangle, Network,
} from "lucide-react"
import { fetchWebSessionDetail } from "@/lib/api"
import { lookupIp } from "@/lib/geo"
import { enrichIp } from "@/lib/ip-enrichment"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { Flag } from "@/components/ui/flag"
import { StatCard } from "@/components/stat-card"
import { IpEnrichment } from "@/components/ip-enrichment"
import { ATTACK_COLORS, ATTACK_LABELS_LONG as ATTACK_LABELS } from "@/lib/attack-types"
import { RequestRow, type RequestGroup } from "@/components/web-request-row"

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ fingerprint: string }>
}) {
  const { fingerprint } = await params
  const fp = decodeURIComponent(fingerprint)

  let detail: Awaited<ReturnType<typeof fetchWebSessionDetail>>
  try {
    detail = await fetchWebSessionDetail(fp)
  } catch {
    notFound()
  }

  const { hits } = detail
  if (hits.length === 0) notFound()

  // Derived stats
  const srcIps = [...new Set(hits.map((h) => h.srcIp))]
  const isMultiIp = srcIps.length > 1
  const firstSeen = hits[hits.length - 1].timestamp
  const lastSeen = hits[0].timestamp
  const totalHits = hits.length
  const canaryHits = hits.filter((h) => h.canaryTriggered).length
  const chainHits = hits.filter((h) => h.isChainAttack).length
  const attackTypes = [...new Set(hits.map((h) => h.attackType))]
  const galahFailures = hits.filter((h) => h.galahResult?.includes("failedResponse")).length

  // Per-IP breakdown
  const perIp = srcIps.map((ip) => {
    const ipHits = hits.filter((h) => h.srcIp === ip)
    return {
      ip,
      count: ipHits.length,
      attackTypes: [...new Set(ipHits.map((h) => h.attackType))],
      firstSeen: ipHits[ipHits.length - 1]?.timestamp,
      lastSeen: ipHits[0]?.timestamp,
      location: lookupIp(ip),
    }
  }).sort((a, b) => b.count - a.count)

  // Attack type breakdown
  const byType = hits.reduce<Record<string, number>>((acc, h) => {
    acc[h.attackType] = (acc[h.attackType] ?? 0) + 1
    return acc
  }, {})

  // Top paths
  const pathCount = hits.reduce<Record<string, number>>((acc, h) => {
    const fullPath = h.query ? `${h.path}?${h.query}` : h.path
    acc[fullPath] = (acc[fullPath] ?? 0) + 1
    return acc
  }, {})
  const topPaths = Object.entries(pathCount).sort((a, b) => b[1] - a[1]).slice(0, 15)

  // Attack chain sequence across all hits
  const attackChainSequence: string[] = []
  for (const h of hits) {
    if (h.attackChain?.length) {
      for (const t of h.attackChain) {
        if (!attackChainSequence.includes(t)) attackChainSequence.push(t)
      }
    }
  }

  // Canary token types
  const canaryTokenTypes = [...new Set(hits.map((h) => h.canaryTokenType).filter(Boolean))]

  // HTTP versions + referers
  const httpVersions = [...new Set(hits.map((h) => h.httpVersion).filter(Boolean))]
  const referers = [...new Set(hits.map((h) => h.referer).filter(Boolean))].slice(0, 5)

  // User agents
  const uniqueUAs = [...new Set(hits.map((h) => h.userAgent).filter(Boolean))]

  // Enrichment for each IP (only first 3 IPs to avoid too many API calls)
  const enrichments = await Promise.all(
    srcIps.slice(0, 3).map(async (ip) => {
      try { return { ip, data: await enrichIp(ip) } } catch { return { ip, data: null } }
    })
  )

  // Group hits into request groups (same as per-IP page, but across all IPs)
  const groupMap = new Map<string, RequestGroup>()
  for (const hit of hits) {
    const fullPath = hit.query ? `${hit.path}?${hit.query}` : hit.path
    const key = `${hit.srcIp} ${hit.method} ${fullPath} ${hit.attackType}`
    const existing = groupMap.get(key)
    const isGalahFail = hit.galahResult?.includes("failedResponse") ? 1 : 0
    const isCanary = Boolean(hit.canaryTriggered)
    if (existing) {
      existing.count++
      existing.galahFailures += isGalahFail
      existing.canary = existing.canary || isCanary
      if (hit.timestamp > existing.lastSeen) {
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
        sampleReferer: hit.referer || undefined, sampleHttpVersion: hit.httpVersion || undefined,
      })
    }
  }
  const groupedHits = [...groupMap.values()].sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
  )

  const durationMs = new Date(lastSeen).getTime() - new Date(firstSeen).getTime()
  const durationLabel = (() => {
    const h = Math.floor(durationMs / 3_600_000)
    const m = Math.floor((durationMs % 3_600_000) / 60_000)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m`
    return `${Math.floor(durationMs / 1000)}s`
  })()

  return (
    <PageShell>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/web-attacks/sessions"
          className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Sessions
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-cyan-400" />
              <h1 className="font-mono text-xl font-semibold text-foreground">{fp}</h1>
            </div>
            {isMultiIp && (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-yellow-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Multi-IP session · possible VPN hopper — {srcIps.length} IPs used
              </div>
            )}
            <p suppressHydrationWarning className="mt-1 text-xs text-muted-foreground">
              First seen {formatDistanceToNow(new Date(firstSeen), { addSuffix: true })} ·{" "}
              Last seen {formatDistanceToNow(new Date(lastSeen), { addSuffix: true })} ·{" "}
              Duration {durationLabel}
            </p>
          </div>
          <div className="flex flex-wrap justify-end items-center gap-1.5">
            {canaryHits > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-400">
                <Target className="h-3 w-3" /> Canary ×{canaryHits}
              </span>
            )}
            {chainHits > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-400">
                <GitBranch className="h-3 w-3" /> Chain ×{chainHits}
              </span>
            )}
            {attackTypes.map((t) => (
              <span key={t} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${ATTACK_COLORS[t] ?? ATTACK_COLORS.recon}`}>
                {ATTACK_LABELS[t] ?? t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={MousePointerClick} label="Total hits" value={totalHits.toLocaleString("en-US")} color="text-warning" bg="bg-warning/20" />
        <StatCard icon={Network} label="IPs used" value={srcIps.length} color={isMultiIp ? "text-yellow-400" : undefined} bg={isMultiIp ? "bg-yellow-500/20" : undefined} />
        <StatCard icon={Shield} label="Attack types" value={attackTypes.length} />
        <StatCard icon={Globe} label="Unique paths" value={Object.keys(pathCount).length} />
      </div>

      {/* IP roster — one card per IP */}
      <Surface className="mb-6 overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-semibold text-foreground">IP addresses used in this session</h3>
          <p className="text-xs text-muted-foreground">
            Same passive fingerprint detected across {srcIps.length} IP{srcIps.length > 1 ? "s" : ""}
            {isMultiIp ? " — likely VPN or proxy rotation" : ""}
          </p>
        </div>
        <div className="divide-y divide-border">
          {perIp.map(({ ip, count, attackTypes: ipTypes, firstSeen: ipFirst, lastSeen: ipLast, location }) => (
            <div key={ip} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                {location?.country && <Flag code={location.country} />}
                <Link href={`/web-attacks/${encodeURIComponent(ip)}`} className="font-mono text-sm text-blue-400 hover:underline">
                  {ip}
                </Link>
                {location?.countryName && <span className="text-xs text-muted-foreground">{location.countryName}</span>}
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                <div className="flex flex-wrap gap-1">
                  {ipTypes.slice(0, 3).map((t) => (
                    <span key={t} className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${ATTACK_COLORS[t] ?? ATTACK_COLORS.recon}`}>
                      {ATTACK_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
                <span suppressHydrationWarning className="whitespace-nowrap">
                  {count} hits · last {formatDistanceToNow(new Date(ipLast ?? lastSeen), { addSuffix: true })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Surface>

      {/* Session intelligence */}
      {(chainHits > 0 || canaryHits > 0 || attackChainSequence.length > 1 || httpVersions.length > 0 || referers.length > 0) && (
        <Surface className="mb-6 p-4">
          <div className="flex flex-wrap items-start gap-6">
            {chainHits > 0 && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/15">
                  <GitBranch className="h-4 w-4 text-orange-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Chain attacks</p>
                  <p className="text-sm font-semibold text-orange-400">{chainHits} recon → exploit transitions</p>
                </div>
              </div>
            )}
            {canaryHits > 0 && canaryTokenTypes.length > 0 && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15">
                  <Target className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Canary token type</p>
                  <p className="text-sm font-semibold text-red-400">
                    {canaryTokenTypes.includes("ip_specific") ? "IP-specific token reused" : "Static token reused"}
                  </p>
                </div>
              </div>
            )}
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
            {httpVersions.length > 0 && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">HTTP versions</p>
                  <p className="font-mono text-sm text-foreground">{httpVersions.join(", ")}</p>
                  {referers.length > 0 && (
                    <>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">Referers</p>
                      {referers.map((r) => (
                        <p key={r} className="truncate font-mono text-xs text-muted-foreground max-w-xs" title={r}>{r}</p>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </Surface>
      )}

      {/* Threat intelligence — one panel per enriched IP */}
      {enrichments.some((e) => e.data) && (
        <div className="mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Threat Intelligence</h2>
          {enrichments.map(({ ip, data }) => data && (
            <div key={ip}>
              <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Flag code={lookupIp(ip)?.country ?? ""} />
                <span className="font-mono">{ip}</span>
              </p>
              <IpEnrichment ip={ip} initialData={data} autoFetch={false} />
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 xl:col-span-1">
          {/* Attack type breakdown */}
          <Surface>
            <div className="border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Breakdown by type</h3>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-border">
              {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, count]) => (
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
                  <p key={i} className="px-4 py-2.5 font-mono text-xs text-muted-foreground break-all">{ua}</p>
                ))}
              </div>
            </Surface>
          )}

          {/* Top paths */}
          <Surface>
            <div className="border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Most targeted paths</h3>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {topPaths.map(([path, count]) => (
                <div key={path} className="flex items-center justify-between gap-2 px-4 py-2">
                  <p className="min-w-0 truncate font-mono text-xs text-foreground" title={path}>{path}</p>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">×{count}</span>
                </div>
              ))}
            </div>
          </Surface>
        </div>

        {/* Right column: full request timeline */}
        <div className="xl:col-span-2">
          <Surface className="overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Request timeline</h3>
              <p className="text-xs text-muted-foreground">
                {groupedHits.length} unique requests · {totalHits} hits across {srcIps.length} IP{srcIps.length > 1 ? "s" : ""}
                {galahFailures > 0 ? ` · ${galahFailures} galah failures` : ""}
                {" · click a row for the raw payload"}
              </p>
            </div>
            <div className="overflow-y-auto max-h-[720px]">
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
                        No requests found.
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
