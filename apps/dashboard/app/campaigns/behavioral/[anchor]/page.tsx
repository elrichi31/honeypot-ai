import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Layers, Network, Terminal, Key, ShieldX, Shield, Cpu,
  Bot, User, Clock, Globe, Code2, Hash,
} from "lucide-react"
import { TimeAgo } from "@/components/time-ago"
import { fetchSessions, fetchSessionCommands, type ApiSession } from "@/lib/api"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { lookupIp } from "@/lib/geo"
import { clusterSessions, type BehaviorCluster } from "@/lib/session-similarity"
import { buildActivityBuckets } from "@/lib/activity-buckets"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { Flag } from "@/components/ui/flag"
import { StatCard } from "@/components/stat-card"
import { SessionActivityChart } from "@/components/session-activity-chart"
import { CMD_LABELS, CMD_COLORS } from "@/lib/attack-types"
import { cn } from "@/lib/utils"

const RANGE_TO_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "all": 0 }

function rangeToDateParams(range: string): { startDate?: string } {
  const days = RANGE_TO_DAYS[range]
  if (!days) return {}
  const start = new Date()
  start.setDate(start.getDate() - days)
  return { startDate: start.toISOString() }
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Behavioral cluster — HoneyTrap" }
}

export default async function BehavioralDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ anchor: string }>
  searchParams: Promise<{ range?: string }>
}) {
  const { anchor } = await params
  const sp = await searchParams
  const range = sp.range && RANGE_TO_DAYS[sp.range] !== undefined ? sp.range : "30d"

  const { sensorIds } = await effectiveSensorScope()

  let sessions: ApiSession[] = []
  let commandsMap: Record<string, string[]> = {}
  try {
    [sessions, commandsMap] = await Promise.all([
      fetchSessions({ limit: 2000, ...rangeToDateParams(range) }, sensorIds),
      fetchSessionCommands(sensorIds),
    ])
  } catch {
    notFound()
  }

  // Recompute clusters deterministically (same session set + threshold as the
  // list view) and pick the one containing the anchor session.
  const clusters = clusterSessions(sessions, commandsMap, 0.4)
  const cluster: BehaviorCluster | undefined = clusters.find((c) =>
    c.sessions.some((s) => s.id === anchor),
  )
  if (!cluster) notFound()

  const clusterSessionsList = cluster.sessions
  const simPct = Math.round(cluster.similarity * 100)

  const sortedByTime = [...clusterSessionsList].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  )
  const firstSeen = sortedByTime[0].startedAt
  const lastSeen = sortedByTime[sortedByTime.length - 1].startedAt

  const srcIps = [...new Set(clusterSessionsList.map((s) => s.srcIp))]
  const compromised = clusterSessionsList.filter((s) => s.loginSuccess).length
  const totalCommands = clusterSessionsList.reduce((a, s) => a + s.commandCount, 0)
  const botCount = clusterSessionsList.filter((s) => s.sessionType === "bot").length
  const humanCount = clusterSessionsList.filter((s) => s.sessionType === "human").length

  const perIp = srcIps
    .map((ip) => {
      const ipSessions = clusterSessionsList.filter((s) => s.srcIp === ip)
      return {
        ip,
        sessions: ipSessions.length,
        compromised: ipSessions.some((s) => s.loginSuccess),
        commands: ipSessions.reduce((a, s) => a + s.commandCount, 0),
        firstSeen: ipSessions.map((s) => s.startedAt).sort()[0],
        location: lookupIp(ip),
      }
    })
    .sort((a, b) => b.sessions - a.sessions)

  // Command frequency across the cluster (for the bar chart).
  const cmdCounts = new Map<string, number>()
  for (const s of clusterSessionsList) {
    for (const cmd of commandsMap[s.id] ?? []) {
      const trimmed = cmd.trim()
      if (trimmed) cmdCounts.set(trimmed, (cmdCounts.get(trimmed) ?? 0) + 1)
    }
  }
  const topCommands = [...cmdCounts.entries()]
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
  const maxCmdCount = topCommands[0]?.count ?? 1

  const credCounts = new Map<string, number>()
  for (const s of clusterSessionsList) {
    if (s.username || s.password) {
      const key = `${s.username ?? ""}:${s.password ?? ""}`
      credCounts.set(key, (credCounts.get(key) ?? 0) + 1)
    }
  }
  const topCreds = [...credCounts.entries()]
    .map(([cred, count]) => ({ cred, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  const tagCounts = new Map<string, number>()
  for (const s of clusterSessionsList) {
    for (const tag of s.threatTags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const threatCategories = [...tagCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  const activityBuckets = buildActivityBuckets(clusterSessionsList.map((s) => s.startedAt))

  const recentSessions = [...clusterSessionsList]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 50)

  return (
    <PageShell>
      <div className="mb-6">
        <Link href={`/campaigns?range=${range}`} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Campaigns
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold text-foreground">Behavioral cluster</h1>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-sm font-semibold text-primary">
                {simPct}% similar
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {clusterSessionsList.length} sessions run near-identical commands from {srcIps.length} IP{srcIps.length > 1 ? "s" : ""}
              {cluster.dominantUsername ? ` · mostly as ${cluster.dominantUsername}` : ""}
            </p>
            <p suppressHydrationWarning className="mt-1 text-xs text-muted-foreground">
              First seen <TimeAgo timestamp={firstSeen} /> · Last seen <TimeAgo timestamp={lastSeen} />
            </p>
          </div>
          <div className="flex flex-wrap justify-end items-center gap-1.5">
            {compromised > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-400">
                <ShieldX className="h-3 w-3" /> {compromised} compromised
              </span>
            )}
            {botCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <Bot className="h-3 w-3" /> {botCount} bot
              </span>
            )}
            {humanCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
                <User className="h-3 w-3" /> {humanCount} human
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={Terminal} label="Sessions" value={clusterSessionsList.length} color="text-primary" bg="bg-primary/15" />
        <StatCard icon={Network} label="IPs" value={srcIps.length} />
        <StatCard icon={Hash} label="Avg similarity" value={`${simPct}%`} />
        <StatCard icon={Cpu} label="Commands run" value={totalCommands.toLocaleString("en-US")} />
        <StatCard icon={ShieldX} label="Compromised" value={compromised} color={compromised > 0 ? "text-red-400" : undefined} bg={compromised > 0 ? "bg-red-500/20" : undefined} />
      </div>

      {cluster.sharedCommands.length > 0 && (
        <Surface className="mb-6 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Shared command signature</h3>
            <span className="ml-auto text-xs text-muted-foreground">
              run by every session in this cluster
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cluster.sharedCommands.map((cmd) => (
              <code key={cmd} className="rounded bg-secondary px-2 py-1 font-mono text-xs text-foreground">
                {cmd}
              </code>
            ))}
          </div>
          {cluster.sharedDomains.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Shared domains:</span>
              {cluster.sharedDomains.map((d) => (
                <code key={d} className="rounded bg-warning/10 px-2 py-1 font-mono text-xs text-warning">{d}</code>
              ))}
            </div>
          )}
        </Surface>
      )}

      {activityBuckets.length > 0 && (
        <SessionActivityChart buckets={activityBuckets} className="mb-6 p-4" />
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Surface className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-semibold text-foreground">IP addresses in this cluster</h3>
              <span className="text-[10px] text-muted-foreground">{srcIps.length} IP{srcIps.length > 1 ? "s" : ""}</span>
            </div>
            <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
              {perIp.map((row) => (
                <Link
                  key={row.ip}
                  href={`/threats/${encodeURIComponent(row.ip)}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/40"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {row.location?.country && <Flag code={row.location.country} />}
                    <span className="font-mono text-sm text-foreground">{row.ip}</span>
                    {row.compromised && <ShieldX className="h-3.5 w-3.5 shrink-0 text-red-400" />}
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                    <span>{row.sessions} sessions</span>
                    <span>{row.commands} cmds</span>
                    <span suppressHydrationWarning><TimeAgo timestamp={row.firstSeen} /></span>
                  </div>
                </Link>
              ))}
            </div>
          </Surface>

          {topCommands.length > 0 && (
            <Surface className="overflow-hidden">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Command frequency</h3>
                <p className="text-xs text-muted-foreground">{cmdCounts.size} unique · top {topCommands.length}</p>
              </div>
              <div className="space-y-2 p-4">
                {topCommands.map((item) => (
                  <div key={item.command} className="flex items-center gap-3">
                    <code className="w-1/2 min-w-0 truncate font-mono text-xs text-foreground" title={item.command}>
                      {item.command}
                    </code>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.round((item.count / maxCmdCount) * 100)}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-xs text-muted-foreground">×{item.count}</span>
                  </div>
                ))}
              </div>
            </Surface>
          )}

          <Surface className="overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Sessions</h3>
              <p className="text-xs text-muted-foreground">{clusterSessionsList.length} total · showing {recentSessions.length} most recent</p>
            </div>
            <div className="max-h-[520px] divide-y divide-border overflow-y-auto">
              {recentSessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {session.loginSuccess ? (
                      <ShieldX className="h-4 w-4 shrink-0 text-red-400" />
                    ) : (
                      <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-foreground">{session.srcIp}</span>
                        {session.username && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {session.username}:{session.password}
                          </span>
                        )}
                        {(session.threatTags ?? []).slice(0, 3).map((tag) => (
                          <span key={tag} className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-medium", CMD_COLORS[tag] ?? CMD_COLORS.other)}>
                            {CMD_LABELS[tag] ?? tag}
                          </span>
                        ))}
                      </div>
                      <p suppressHydrationWarning className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <TimeAgo timestamp={session.startedAt} /> · {session.commandCount} cmds · {session.authAttemptCount} auth
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/sessions/${session.id}`}
                    className="ml-2 shrink-0 rounded-lg bg-secondary px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Replay →
                  </Link>
                </div>
              ))}
            </div>
          </Surface>
        </div>

        <div className="space-y-6 xl:col-span-1">
          {threatCategories.length > 0 && (
            <Surface>
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Threat categories</h3>
                <p className="text-xs text-muted-foreground">Across all sessions</p>
              </div>
              <div className="divide-y divide-border">
                {threatCategories.map(({ category, count }) => (
                  <div key={category} className="flex items-center justify-between px-4 py-2.5">
                    <span className={cn("rounded-md border px-2 py-0.5 text-xs font-medium", CMD_COLORS[category] ?? CMD_COLORS.other)}>
                      {CMD_LABELS[category] ?? category}
                    </span>
                    <span className="font-mono text-sm font-semibold text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </Surface>
          )}

          {topCreds.length > 0 && (
            <Surface>
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Credentials tried</h3>
                <p className="text-xs text-muted-foreground">{credCounts.size} unique pairs</p>
              </div>
              <div className="max-h-64 divide-y divide-border overflow-y-auto">
                {topCreds.map(({ cred, count }) => (
                  <div key={cred} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <code className="min-w-0 truncate font-mono text-xs text-foreground" title={cred}>{cred}</code>
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">×{count}</span>
                  </div>
                ))}
              </div>
            </Surface>
          )}

          <Surface padded className="text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-2">
              <Globe className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">How this cluster was built</span>
            </div>
            <p>
              Sessions are grouped by Jaccard similarity of their command sets. This
              cluster averages <strong className="text-foreground">{simPct}%</strong> overlap —
              a strong sign of a shared script or toolkit, even across different IPs.
            </p>
          </Surface>
        </div>
      </div>
    </PageShell>
  )
}
