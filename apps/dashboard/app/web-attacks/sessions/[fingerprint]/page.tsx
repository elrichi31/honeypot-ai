import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import {
  ArrowLeft, Fingerprint, GitBranch, Target, Clock, MousePointerClick,
  Globe, Shield, AlertTriangle, Network, Zap, Code2, ArrowRight,
} from "lucide-react"
import { TimeAgo } from "@/components/time-ago"
import { fetchWebSessionDetail } from "@/lib/api"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { lookupIp } from "@/lib/geo"
import { enrichIp } from "@/lib/ip-enrichment"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { Flag } from "@/components/ui/flag"
import { StatCard } from "@/components/stat-card"
import { AttackTypeBadge } from "@/components/attack-type-badge"
import { RequestRow, type RequestGroup } from "@/components/web-request-row"
import { IpThreatRow } from "@/components/ip-threat-row"
import { SessionActivityChart } from "@/components/session-activity-chart"

function buildActivityBuckets(timestamps: string[], bucketCount = 24) {
  if (timestamps.length === 0) return []
  const times = timestamps.map((t) => new Date(t).getTime()).sort((a, b) => a - b)
  const minT = times[0]
  const maxT = times[times.length - 1]
  const span = maxT - minT || 1
  const buckets: { label: string; count: number; start: number }[] = Array.from(
    { length: bucketCount },
    (_, i) => ({ start: minT + (span / bucketCount) * i, label: "", count: 0 }),
  )
  for (const t of times) {
    const idx = Math.min(bucketCount - 1, Math.floor(((t - minT) / span) * bucketCount))
    buckets[idx].count++
  }
  buckets.forEach((b) => { b.label = format(new Date(b.start), "HH:mm") })
  return buckets
}

type WebHit = Awaited<ReturnType<typeof fetchWebSessionDetail>>["hits"][0]

function extractPayloads(hits: WebHit[]): { payload: string; count: number; attackType: string }[] {
  const map = new Map<string, { count: number; attackType: string }>()
  for (const h of hits) {
    const raw = h.body?.trim()
    if (!raw || raw.length < 3) continue
    const key = raw.slice(0, 200)
    const existing = map.get(key)
    if (existing) existing.count++
    else map.set(key, { count: 1, attackType: h.attackType })
  }
  return [...map.entries()]
    .map(([payload, { count, attackType }]) => ({ payload, count, attackType }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

function buildIpHopTimeline(hits: WebHit[]) {
  const sorted = [...hits].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )
  const segments: { ip: string; start: string; end: string; count: number }[] = []
  let current: (typeof segments)[0] | null = null
  for (const h of sorted) {
    if (!current || current.ip !== h.srcIp) {
      current = { ip: h.srcIp, start: h.timestamp, end: h.timestamp, count: 1 }
      segments.push(current)
    } else {
      current.end = h.timestamp
      current.count++
    }
  }
  return segments
}

export async function generateMetadata({ params }: { params: Promise<{ fingerprint: string }> }): Promise<Metadata> {
  const { fingerprint } = await params
  return { title: `Web Session ${fingerprint.slice(0, 8)} — HoneyTrap` }
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ fingerprint: string }>
}) {
  const { fingerprint } = await params
  const fp = decodeURIComponent(fingerprint)

  const { sensorIds } = await effectiveSensorScope()
  let detail: Awaited<ReturnType<typeof fetchWebSessionDetail>> | null = null
  try {
    detail = await fetchWebSessionDetail(fp, sensorIds)
  } catch {
    // endpoint returned 404 or network error
  }

  if (!detail || detail.hits.length === 0) notFound()

  const { hits } = detail

  const srcIps = [...new Set(hits.map((h) => h.srcIp))]
  const isMultiIp = srcIps.length > 1
  const firstSeen = hits[hits.length - 1].timestamp
  const lastSeen = hits[0].timestamp
  const totalHits = hits.length
  const canaryHits = hits.filter((h) => h.canaryTriggered).length
  const chainHits = hits.filter((h) => h.isChainAttack).length
  const attackTypes = [...new Set(hits.map((h) => h.attackType))]
  const galahFailures = hits.filter((h) => h.galahResult?.includes("failedResponse")).length

  const perIp = srcIps
    .map((ip) => {
      const ipHits = hits.filter((h) => h.srcIp === ip)
      return {
        ip,
        count: ipHits.length,
        attackTypes: [...new Set(ipHits.map((h) => h.attackType))],
        firstSeen: ipHits[ipHits.length - 1]?.timestamp,
        lastSeen: ipHits[0]?.timestamp,
        location: lookupIp(ip),
      }
    })
    .sort((a, b) => b.count - a.count)

  const byType = hits.reduce<Record<string, number>>((acc, h) => {
    acc[h.attackType] = (acc[h.attackType] ?? 0) + 1
    return acc
  }, {})

  const pathCount = hits.reduce<Record<string, number>>((acc, h) => {
    const fullPath = h.query ? `${h.path}?${h.query}` : h.path
    acc[fullPath] = (acc[fullPath] ?? 0) + 1
    return acc
  }, {})
  const topPaths = Object.entries(pathCount).sort((a, b) => b[1] - a[1]).slice(0, 15)

  const reconPaths = hits
    .filter((h) => h.attackType === "recon" || h.attackType === "scan")
    .reduce<Record<string, number>>((acc, h) => {
      const p = h.query ? `${h.path}?${h.query}` : h.path
      acc[p] = (acc[p] ?? 0) + 1
      return acc
    }, {})
  const exploitPaths = hits
    .filter((h) => h.attackType !== "recon" && h.attackType !== "scan")
    .reduce<Record<string, number>>((acc, h) => {
      const p = h.query ? `${h.path}?${h.query}` : h.path
      acc[p] = (acc[p] ?? 0) + 1
      return acc
    }, {})

  const attackChainSequence: string[] = []
  for (const h of hits) {
    if (h.attackChain?.length) {
      for (const t of h.attackChain) {
        if (!attackChainSequence.includes(t)) attackChainSequence.push(t)
      }
    }
  }

  const canaryTokenTypes = [...new Set(hits.map((h) => h.canaryTokenType).filter(Boolean))]
  const httpVersions = [...new Set(hits.map((h) => h.httpVersion).filter(Boolean))]
  const referers = [...new Set(hits.map((h) => h.referer).filter(Boolean))].slice(0, 5)
  const uniqueUAs = [...new Set(hits.map((h) => h.userAgent).filter(Boolean))]

  const activityBuckets = buildActivityBuckets(hits.map((h) => h.timestamp))

  const durationMs = new Date(lastSeen).getTime() - new Date(firstSeen).getTime()
  const durationMinutes = durationMs / 60_000 || 1
  const avgRpm = totalHits / durationMinutes
  const sortedTs = hits.map((h) => new Date(h.timestamp).getTime()).sort((a, b) => a - b)
  let peakRpm = 0
  for (let i = 0; i < sortedTs.length; i++) {
    const windowEnd = sortedTs[i] + 60_000
    let count = 1
    for (let j = i + 1; j < sortedTs.length && sortedTs[j] <= windowEnd; j++) count++
    if (count > peakRpm) peakRpm = count
  }

  const payloads = extractPayloads(hits)
  const hopTimeline = isMultiIp ? buildIpHopTimeline(hits) : []

  const enrichments = await Promise.all(
    srcIps.slice(0, 3).map(async (ip) => {
      try { return { ip, data: await enrichIp(ip) } } catch { return { ip, data: null } }
    }),
  )

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
        sampleBody: hit.body ?? "", sampleHeaders: hit.headers ?? null,
        sampleUserAgent: hit.userAgent, sampleReferer: hit.referer || undefined,
        sampleHttpVersion: hit.httpVersion || undefined,
      })
    }
  }
  const groupedHits = [...groupMap.values()].sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
  )

  const durationLabel = (() => {
    const h = Math.floor(durationMs / 3_600_000)
    const m = Math.floor((durationMs % 3_600_000) / 60_000)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m`
    return `${Math.floor(durationMs / 1000)}s`
  })()

  return (
    <PageShell>
      <div className="mb-6">
        <Link href="/web-attacks/sessions" className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
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
                Multi-IP session &middot; possible VPN hopper &mdash; {srcIps.length} IPs used
              </div>
            )}
            <p suppressHydrationWarning className="mt-1 text-xs text-muted-foreground">
              First seen <TimeAgo timestamp={firstSeen} /> &middot;{" "}
              Last seen <TimeAgo timestamp={lastSeen} /> &middot; Duration {durationLabel}
            </p>
          </div>
          <div className="flex flex-wrap justify-end items-center gap-1.5">
            {canaryHits > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-400">
                <Target className="h-3 w-3" /> Canary x{canaryHits}
              </span>
            )}
            {chainHits > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-400">
                <GitBranch className="h-3 w-3" /> Chain x{chainHits}
              </span>
            )}
            {attackTypes.map((t) => (
              <AttackTypeBadge key={t} type={t} size="base" long />
            ))}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={MousePointerClick} label="Total hits" value={totalHits.toLocaleString("en-US")} color="text-warning" bg="bg-warning/20" />
        <StatCard icon={Network} label="IPs used" value={srcIps.length} color={isMultiIp ? "text-yellow-400" : undefined} bg={isMultiIp ? "bg-yellow-500/20" : undefined} />
        <StatCard icon={Shield} label="Attack types" value={attackTypes.length} />
        <StatCard icon={Globe} label="Unique paths" value={Object.keys(pathCount).length} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Surface className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-yellow-400" />
            <h3 className="text-sm font-semibold text-foreground">Attack speed</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Average</span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {avgRpm < 1 ? avgRpm.toFixed(2) : avgRpm.toFixed(1)} req/min
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Peak (1-min window)</span>
              <span className="font-mono text-sm font-semibold text-orange-400">{peakRpm} req/min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Galah failures</span>
              <span className="font-mono text-sm font-semibold text-red-400">{galahFailures > 0 ? galahFailures : "none"}</span>
            </div>
          </div>
        </Surface>

        <SessionActivityChart buckets={activityBuckets} className="p-4 sm:col-span-2" />
      </div>

      {isMultiIp && hopTimeline.length > 1 && (
        <Surface className="mb-6 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Network className="h-4 w-4 text-yellow-400" />
            <h3 className="text-sm font-semibold text-foreground">IP rotation timeline</h3>
            <span className="ml-auto text-xs text-muted-foreground">{hopTimeline.length} segments</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {hopTimeline.map((seg, i) => {
              const loc = lookupIp(seg.ip)
              return (
                <div key={i} className="flex items-center gap-1">
                  <div className="rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-xs">
                    <div className="flex items-center gap-1 font-mono font-semibold text-blue-400">
                      {loc?.country && <Flag code={loc.country} />}
                      <Link href={`/web-attacks/${encodeURIComponent(seg.ip)}`} className="hover:underline">{seg.ip}</Link>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span suppressHydrationWarning>{format(new Date(seg.start), "HH:mm:ss")}</span>
                      <span className="opacity-50">|</span>
                      <span>{seg.count} hits</span>
                    </div>
                  </div>
                  {i < hopTimeline.length - 1 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </div>
              )
            })}
          </div>
        </Surface>
      )}

      <Surface className="mb-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-semibold text-foreground">IP addresses used in this session</h3>
          <span className="text-[10px] text-muted-foreground">
            {srcIps.length} IP{srcIps.length > 1 ? "s" : ""}
            {isMultiIp ? " — same passive fingerprint, likely VPN or proxy rotation" : ""}
          </span>
        </div>
        <div className="divide-y divide-border">
          {perIp.map(({ ip, count, attackTypes: ipTypes, location }) => (
            <IpThreatRow
              key={ip}
              ip={ip}
              count={count}
              attackTypes={ipTypes}
              location={location ?? null}
              initialData={enrichments.find((e) => e.ip === ip)?.data ?? null}
            />
          ))}
        </div>
      </Surface>

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
                  <p className="text-sm font-semibold text-orange-400">{chainHits} recon to exploit transitions</p>
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
                        <AttackTypeBadge type={t} long />
                        {i < attackChainSequence.length - 1 && <span className="text-muted-foreground text-xs">to</span>}
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


      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-1">
          <Surface>
            <div className="border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Breakdown by type</h3>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-border">
              {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, count]) => (
                <div key={t} className="flex items-center justify-between px-4 py-2.5">
                  <AttackTypeBadge type={t} long />
                  <span className="font-mono text-sm font-semibold text-foreground">{count}</span>
                </div>
              ))}
            </div>
          </Surface>

          {Object.keys(reconPaths).length > 0 && Object.keys(exploitPaths).length > 0 && (
            <Surface>
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Paths by phase</h3>
                <p className="text-xs text-muted-foreground">Recon vs exploit split</p>
              </div>
              <div className="divide-y divide-border">
                <div className="p-3">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Recon / Scan</p>
                  <div className="space-y-1">
                    {Object.entries(reconPaths).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, c]) => (
                      <div key={p} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={p}>{p}</span>
                        <span className="shrink-0 font-mono text-xs text-foreground">x{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-3">
                  <p className="mb-1.5 text-xs font-medium text-orange-400 uppercase tracking-wider">Exploit / Other</p>
                  <div className="space-y-1">
                    {Object.entries(exploitPaths).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, c]) => (
                      <div key={p} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={p}>{p}</span>
                        <span className="shrink-0 font-mono text-xs text-foreground">x{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Surface>
          )}

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

          <Surface>
            <div className="border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Most targeted paths</h3>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {topPaths.map(([path, count]) => (
                <div key={path} className="flex items-center justify-between gap-2 px-4 py-2">
                  <p className="min-w-0 truncate font-mono text-xs text-foreground" title={path}>{path}</p>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">x{count}</span>
                </div>
              ))}
            </div>
          </Surface>
        </div>

        <div className="space-y-6 xl:col-span-2">
          {payloads.length > 0 && (
            <Surface className="overflow-hidden">
              <div className="border-b border-border p-4">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-purple-400" />
                  <h3 className="font-semibold text-foreground">Payload analysis</h3>
                </div>
                <p className="text-xs text-muted-foreground">Most frequent request bodies</p>
              </div>
              <div className="divide-y divide-border">
                {payloads.map((p, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="mb-1 flex items-center gap-2">
                      <AttackTypeBadge type={p.attackType} size="xs" />
                      <span className="ml-auto font-mono text-xs text-muted-foreground">x{p.count}</span>
                    </div>
                    <pre className="overflow-x-auto rounded bg-muted/40 p-2 font-mono text-xs text-foreground whitespace-pre-wrap break-all max-h-24">
                      {p.payload}
                    </pre>
                  </div>
                ))}
              </div>
            </Surface>
          )}

          <Surface className="overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Request timeline</h3>
              <p className="text-xs text-muted-foreground">
                {groupedHits.length} unique requests - {totalHits} hits across {srcIps.length} IP{srcIps.length > 1 ? "s" : ""}
                {galahFailures > 0 ? ` - ${galahFailures} galah failures` : ""}
                {" - click a row for the raw payload"}
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