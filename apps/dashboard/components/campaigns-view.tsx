"use client"

import { useState } from "react"
import Link from "next/link"
import { formatDistanceToNow, format } from "date-fns"
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
  { value: "ip",       label: "IP Address",      icon: Globe,        desc: "Misma IP exacta" },
  { value: "subnet",   label: "Subnet /24",       icon: Network,      desc: "Misma subred /24" },
  { value: "hassh",    label: "SSH Fingerprint",  icon: Fingerprint,  desc: "Mismo cliente SSH" },
  { value: "username", label: "Username",         icon: User,         desc: "Mismo usuario" },
]

// ─── Campaign card ────────────────────────────────────────────────────────────

function CampaignCard({ campaign }: { campaign: Campaign }) {
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
                <ShieldX className="h-3 w-3" /> Comprometido
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Terminal className="h-3 w-3" /> {campaign.sessions.length} sesiones
            </span>
            {campaign.groupBy !== "ip" && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" /> {campaign.uniqueIps} IPs
              </span>
            )}
            <span className="flex items-center gap-1">
              <Terminal className="h-3 w-3" /> {campaign.totalCommands} eventos
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Primero: {formatDistanceToNow(new Date(campaign.firstSeen), { addSuffix: true })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Último: {formatDistanceToNow(new Date(campaign.lastSeen), { addSuffix: true })}
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
          <div className="text-xs text-muted-foreground">sesiones</div>
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
                      {format(new Date(session.startedAt), "MMM d, HH:mm:ss")} ·{" "}
                      {session._count.events} eventos
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
              {cluster.sessions.length} sesiones · {simPct}% similitud
            </span>
            {cluster.dominantUsername && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground">
                usuario: {cluster.dominantUsername}
              </span>
            )}
          </div>

          {cluster.sharedCommands.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">Comandos compartidos:</span>
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
              <span className="text-xs text-muted-foreground mr-1">Dominios:</span>
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
              <span>+{cluster.sessions.length - 5} más</span>
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
                    {format(new Date(session.startedAt), "MMM d, HH:mm:ss")}
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
          Repetición por origen
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
          Clusters conductuales
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
                ? `${campaigns.length} campaña${campaigns.length > 1 ? "s" : ""} detectada${campaigns.length > 1 ? "s" : ""} · ${sessions.length} sesiones analizadas`
                : `No se detectaron patrones repetidos agrupando por ${groupBy}. Se necesitan 2+ sesiones del mismo origen.`}
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
            <p className="font-medium text-foreground mb-1">¿Cómo funciona?</p>
            <p>
              Se calcula la similitud de Jaccard entre los conjuntos de comandos de cada sesión.
              Las sesiones con más del <strong className="text-foreground">40% de similitud</strong> se agrupan en un cluster.
              Útil para detectar botnets o atacantes que usan el mismo script aunque vengan de IPs distintas.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            {clusters.length > 0
              ? `${clusters.length} cluster${clusters.length > 1 ? "s" : ""} conductual${clusters.length > 1 ? "es" : ""} detectado${clusters.length > 1 ? "s" : ""}`
              : "No se encontraron sesiones con comportamiento similar. Se necesitan sesiones con comandos en común."}
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
