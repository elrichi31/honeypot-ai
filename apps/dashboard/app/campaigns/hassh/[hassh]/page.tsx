import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import {
  ArrowLeft, Fingerprint, Network, Terminal, Key, ShieldX, Shield,
  AlertTriangle, Cpu, Bot, User, Clock,
} from "lucide-react"
import { TimeAgo } from "@/components/time-ago"
import { fetchSessions, fetchSessionCommands, type ApiSession } from "@/lib/api"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { lookupIp } from "@/lib/geo"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { Flag } from "@/components/ui/flag"
import { StatCard } from "@/components/stat-card"
import { SessionActivityChart } from "@/components/session-activity-chart"
import { CMD_LABELS, CMD_COLORS } from "@/lib/attack-types"
import { cn } from "@/lib/utils"

function buildActivityBuckets(timestamps: string[], bucketCount = 24) {
  if (timestamps.length === 0) return []
  const times = timestamps.map((t) => new Date(t).getTime()).sort((a, b) => a - b)
  const minT = times[0]
  const maxT = times[times.length - 1]
  const span = maxT - minT || 1
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    start: minT + (span / bucketCount) * i,
    label: "",
    count: 0,
  }))
  for (const t of times) {
    const idx = Math.min(bucketCount - 1, Math.floor(((t - minT) / span) * bucketCount))
    buckets[idx].count++
  }
  buckets.forEach((b) => { b.label = format(new Date(b.start), "MMM d HH:mm") })
  return buckets
}

export async function generateMetadata({ params }: { params: Promise<{ hassh: string }> }): Promise<Metadata> {
  const { hassh } = await params
  return { title: `SSH Fingerprint ${decodeURIComponent(hassh).slice(0, 8)} — HoneyTrap` }
}

export default async function HasshDetailPage({
  params,
}: {
  params: Promise<{ hassh: string }>
}) {
  const { hassh } = await params
  const fp = decodeURIComponent(hassh)

  const { sensorIds } = await effectiveSensorScope()

  let sessions: ApiSession[] = []
  let commandsMap: Record<string, string[]> = {}
  try {
    [sessions, commandsMap] = await Promise.all([
      fetchSessions({ q: fp, limit: 1000 }, sensorIds),
      fetchSessionCommands(sensorIds),
    ])
  } catch {
    notFound()
  }

  // `q` is a broad ILIKE across several columns — keep only exact-hassh rows.
  sessions = sessions.filter((s) => s.hassh === fp)
  if (sessions.length === 0) notFound()

  const sorted = [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  )
  const firstSeen = sorted[0].startedAt
  const lastSeen = sorted[sorted.length - 1].startedAt
  const durationMs = new Date(lastSeen).getTime() - new Date(firstSeen).getTime()

  const srcIps = [...new Set(sessions.map((s) => s.srcIp))]
  const isMultiIp = srcIps.length > 1
  const compromised = sessions.filter((s) => s.loginSuccess).length
  const totalAuth = sessions.reduce((a, s) => a + s.authAttemptCount, 0)
  const totalCommands = sessions.reduce((a, s) => a + s.commandCount, 0)

  const botCount = sessions.filter((s) => s.sessionType === "bot").length
  const humanCount = sessions.filter((s) => s.sessionType === "human").length

  // Self-reported client banners — several distinct banners under ONE crypto
  // fingerprint is a spoofing signal (the tool lies about who it is).
  const clientVersions = [...new Set(sessions.map((s) => s.clientVersion).filter(Boolean))] as string[]

  // Per-IP breakdown.
  const perIp = srcIps
    .map((ip) => {
      const ipSessions = sessions.filter((s) => s.srcIp === ip)
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

  // Credentials tried, most frequent first.
  const credCounts = new Map<string, number>()
  for (const s of sessions) {
    if (s.username || s.password) {
      const key = `${s.username ?? ""}:${s.password ?? ""}`
      credCounts.set(key, (credCounts.get(key) ?? 0) + 1)
    }
  }
  const topCreds = [...credCounts.entries()]
    .map(([cred, count]) => ({ cred, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  // Threat categories aggregated from server-computed threatTags.
  const tagCounts = new Map<string, number>()
  for (const s of sessions) {
    for (const tag of s.threatTags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  const threatCategories = [...tagCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  // Top commands actually run under this fingerprint.
  const cmdCounts = new Map<string, number>()
  for (const s of sessions) {
    for (const cmd of commandsMap[s.id] ?? []) {
      const trimmed = cmd.trim()
      if (trimmed) cmdCounts.set(trimmed, (cmdCounts.get(trimmed) ?? 0) + 1)
    }
  }
  const topCommands = [...cmdCounts.entries()]
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  const activityBuckets = buildActivityBuckets(sessions.map((s) => s.startedAt))

  const durationLabel = (() => {
    const h = Math.floor(durationMs / 3_600_000)
    const d = Math.floor(h / 24)
    if (d > 0) return `${d}d ${h % 24}h`
    const m = Math.floor((durationMs % 3_600_000) / 60_000)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m`
    return `${Math.floor(durationMs / 1000)}s`
  })()

  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 50)

  return (
    <PageShell>
      <div className="mb-6">
        <Link href="/campaigns" className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Campaigns
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-cyan-400" />
              <h1 className="break-all font-mono text-xl font-semibold text-foreground">{fp}</h1>
            </div>
            {isMultiIp && (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-yellow-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Distributed: same SSH client from {srcIps.length} IPs — coordinated scan or shared tool
              </div>
            )}
            <p suppressHydrationWarning className="mt-1 text-xs text-muted-foreground">
              First seen <TimeAgo timestamp={firstSeen} /> · Last seen <TimeAgo timestamp={lastSeen} /> · Active {durationLabel}
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
        <StatCard icon={Terminal} label="Sessions" value={sessions.length.toLocaleString("en-US")} color="text-warning" bg="bg-warning/20" />
        <StatCard icon={Network} label="IPs used" value={srcIps.length} color={isMultiIp ? "text-yellow-400" : undefined} bg={isMultiIp ? "bg-yellow-500/20" : undefined} />
        <StatCard icon={Key} label="Auth attempts" value={totalAuth.toLocaleString("en-US")} />
        <StatCard icon={Cpu} label="Commands run" value={totalCommands.toLocaleString("en-US")} />
        <StatCard icon={ShieldX} label="Compromised" value={compromised} color={compromised > 0 ? "text-red-400" : undefined} bg={compromised > 0 ? "bg-red-500/20" : undefined} />
      </div>

      {activityBuckets.length > 0 && (
        <SessionActivityChart buckets={activityBuckets} className="mb-6 p-4" />
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Surface className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-semibold text-foreground">IP addresses using this fingerprint</h3>
              <span className="text-[10px] text-muted-foreground">
                {srcIps.length} IP{srcIps.length > 1 ? "s" : ""}
                {isMultiIp ? " — same crypto stack, likely one operator or botnet" : ""}
              </span>
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
                <h3 className="font-semibold text-foreground">Commands run under this fingerprint</h3>
                <p className="text-xs text-muted-foreground">{cmdCounts.size} unique · top {topCommands.length}</p>
              </div>
              <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
                {topCommands.map((item) => (
                  <div key={item.command} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <code className="min-w-0 truncate font-mono text-xs text-foreground" title={item.command}>
                      {item.command}
                    </code>
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">×{item.count}</span>
                  </div>
                ))}
              </div>
            </Surface>
          )}

          <Surface className="overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Sessions</h3>
              <p className="text-xs text-muted-foreground">{sessions.length} total · showing {recentSessions.length} most recent</p>
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

          <Surface>
            <div className="border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Client banners</h3>
              <p className="text-xs text-muted-foreground">
                {clientVersions.length} distinct
                {clientVersions.length > 1 ? " — banner spoofing likely" : ""}
              </p>
            </div>
            <div className="max-h-48 divide-y divide-border overflow-y-auto">
              {clientVersions.length > 0 ? (
                clientVersions.map((cv) => (
                  <p key={cv} className="break-all px-4 py-2.5 font-mono text-xs text-muted-foreground">{cv}</p>
                ))
              ) : (
                <p className="px-4 py-2.5 text-xs text-muted-foreground">No client banner recorded.</p>
              )}
            </div>
          </Surface>
        </div>
      </div>
    </PageShell>
  )
}
