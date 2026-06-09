"use client"

import { useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import {
  ChevronDown,
  ChevronRight,
  Globe,
  Network,
  Fingerprint,
  User,
  Shield,
  ShieldX,
  Terminal,
  Key,
  Clock,
  Cpu,
  Layers,
} from "lucide-react"
import { detectCampaigns, type CampaignGroupBy, type Campaign } from "@/lib/campaigns"
import { clusterSessions, type BehaviorCluster } from "@/lib/session-similarity"
import type { ApiSession } from "@/lib/api"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

type ActiveTab = "campaigns" | "clusters"

const GROUP_OPTIONS: {
  value: CampaignGroupBy
  label: string
  icon: typeof Globe
  desc: string
}[] = [
  { value: "ip",       label: "IP Address",      icon: Globe,        desc: "Same exact IP" },
  { value: "subnet",   label: "Subnet /24",       icon: Network,      desc: "Same /24 subnet" },
  { value: "hassh",    label: "SSH Fingerprint",  icon: Fingerprint,  desc: "Same SSH client" },
  { value: "username", label: "Username",         icon: User,         desc: "Same user" },
]

// ─── Campaign card ────────────────────────────────────────────────────────────

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const tz = useTimezone()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-4 p-4 text-left hover:bg-secondary/40 transition-colors"
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-foreground truncate">
              {campaign.label}
            </span>
            {campaign.loginSuccess && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
                <ShieldX className="h-3 w-3" /> Compromised
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Terminal className="h-3 w-3" /> {campaign.sessions.length} sessions
            </span>
            {campaign.groupBy !== "ip" && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" /> {campaign.uniqueIps} IPs
              </span>
            )}
            <span className="flex items-center gap-1">
              <Terminal className="h-3 w-3" /> {campaign.totalCommands} events
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              First: {formatDistanceToNow(new Date(campaign.firstSeen), { addSuffix: true })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last: {formatDistanceToNow(new Date(campaign.lastSeen), { addSuffix: true })}
            </span>
          </div>

          {campaign.topCredentials.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {campaign.topCredentials.slice(0, 3).map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground"
                >
                  <Key className="h-2.5 w-2.5" />
                  {c.username}:{c.password}
                  {c.count > 1 && (
                    <span className="ml-1 rounded-full bg-border px-1 text-[10px]">×{c.count}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold text-primary">{campaign.sessions.length}</div>
          <div className="text-xs text-muted-foreground">sessions</div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-secondary/20">
          <div className="divide-y divide-border">
            {campaign.sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  {session.loginSuccess ? (
                    <ShieldX className="h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-foreground">{session.srcIp}</span>
                      {session.username && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {session.username}:{session.password}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatInTimezone(session.startedAt, tz, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} ·{" "}
                      {session._count.events} events
                    </p>
                  </div>
                </div>
                <Link
                  href={`/sessions/${session.id}`}
                  className="ml-4 shrink-0 rounded-lg bg-secondary px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Replay →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Behavior cluster card ────────────────────────────────────────────────────

function ClusterCard({ cluster }: { cluster: BehaviorCluster }) {
  const tz = useTimezone()
  const [expanded, setExpanded] = useState(false)
  const simPct = Math.round(cluster.similarity * 100)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-4 p-4 text-left hover:bg-secondary/40 transition-colors"
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-primary" />
          ) : (
            <Layers className="h-4 w-4 text-primary" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {cluster.sessions.length} sessions · {simPct}% similarity
            </span>
            {cluster.dominantUsername && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground">
                user: {cluster.dominantUsername}
              </span>
            )}
          </div>

          {cluster.sharedCommands.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">Shared commands:</span>
              {cluster.sharedCommands.slice(0, 5).map((cmd, i) => (
                <code
                  key={i}
                  className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground"
                >
                  {cmd}
                </code>
              ))}
            </div>
          )}

          {cluster.sharedDomains.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">Domains:</span>
              {cluster.sharedDomains.slice(0, 3).map((d, i) => (
                <code key={i} className="rounded bg-warning/10 px-1.5 py-0.5 font-mono text-xs text-warning">
                  {d}
                </code>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {cluster.sessions.map((s) => s.srcIp).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5).map((ip) => (
              <span key={ip} className="font-mono">{ip}</span>
            ))}
            {cluster.sessions.length > 5 && (
              <span>+{cluster.sessions.length - 5} more</span>
            )}
          </div>
        </div>

        {/* Similarity badge */}
        <div className="shrink-0 text-right">
          <div className="relative flex h-10 w-10 items-center justify-center">
            <svg className="absolute h-10 w-10 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="14" fill="none"
                stroke="hsl(var(--primary))" strokeWidth="3"
                strokeDasharray={`${simPct * 0.879} 87.9`}
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xs font-bold text-primary">{simPct}%</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-secondary/20">
          <div className="divide-y divide-border">
            {cluster.sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <span className="font-mono text-sm text-foreground">{session.srcIp}</span>
                  {session.username && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {session.username}:{session.password}
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatInTimezone(session.startedAt, tz, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                  </p>
                </div>
                <Link
                  href={`/sessions/${session.id}`}
                  className="ml-4 shrink-0 rounded-lg bg-secondary px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Replay →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function CampaignsView({
  sessions,
  commandsMap,
}: {
  sessions: ApiSession[]
  commandsMap: Record<string, string[]>
}) {
  const [tab, setTab] = useState<ActiveTab>("campaigns")
  const [groupBy, setGroupBy] = useState<CampaignGroupBy>("ip")

  const campaigns = detectCampaigns(sessions, groupBy)
  const clusters = clusterSessions(sessions, commandsMap, 0.4)

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        <button
          onClick={() => setTab("campaigns")}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            tab === "campaigns"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Globe className="h-3.5 w-3.5" />
          Repeat by origin
        </button>
        <button
          onClick={() => setTab("clusters")}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            tab === "clusters"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Cpu className="h-3.5 w-3.5" />
          Behavioral clusters
          {clusters.length > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 text-xs">
              {clusters.length}
            </span>
          )}
        </button>
      </div>

      {/* ── CAMPAIGNS TAB ── */}
      {tab === "campaigns" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {GROUP_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const active = groupBy === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setGroupBy(opt.value)}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:bg-secondary/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("text-sm font-medium", active ? "text-primary" : "text-foreground")}>
                      {opt.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </button>
              )
            })}
          </div>

          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              {campaigns.length > 0
                ? `${campaigns.length} campaign${campaigns.length > 1 ? "s" : ""} detected · ${sessions.length} sessions analyzed`
                : `No repeated patterns detected when grouping by ${groupBy}. 2+ sessions from the same origin are needed.`}
            </p>
            <div className="space-y-3">
              {campaigns.map((c) => (
                <CampaignCard key={c.key} campaign={c} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CLUSTERS TAB ── */}
      {tab === "clusters" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How does it work?</p>
            <p>
              Jaccard similarity is computed between the command sets of each session.
              Sessions with more than <strong className="text-foreground">40% similarity</strong> are grouped into a cluster.
              Useful for detecting botnets or attackers using the same script from different IPs.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            {clusters.length > 0
              ? `${clusters.length} behavioral cluster${clusters.length > 1 ? "s" : ""} detected`
              : "No sessions with similar behavior found. Sessions with commands in common are needed."}
          </p>

          <div className="space-y-3">
            {clusters.map((c) => (
              <ClusterCard key={c.id} cluster={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
