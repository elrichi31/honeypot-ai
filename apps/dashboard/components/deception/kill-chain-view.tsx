"use client"

import { useState } from "react"
import Link from "next/link"
import { Terminal, ChevronRight, ChevronDown, Database, Server, Globe, HardDrive, KeyRound, ExternalLink, Ghost } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import type { KillChain, KillChainStep } from "@/lib/api/deception"

// OpenCanary logdata keys worth surfacing per step, in display order.
const STEP_FIELD_LABELS: Record<string, string> = {
  USERNAME: "Username",
  PASSWORD: "Password",
  PATH: "Path",
  HOSTNAME: "Host",
  USERAGENT: "User-Agent",
  USER_AGENT: "User-Agent",
  REMOTEVERSION: "Client",
  CLIENTVERSION: "Client",
  COMMAND: "Command",
}

function stepLogFields(logdata: Record<string, unknown> | null): Array<[string, string]> {
  if (!logdata) return []
  const out: Array<[string, string]> = []
  for (const key of Object.keys(STEP_FIELD_LABELS)) {
    const v = logdata[key]
    if (v !== undefined && v !== null && v !== "") out.push([STEP_FIELD_LABELS[key], String(v)])
  }
  return out
}

function serviceIcon(protocol: string) {
  switch (protocol) {
    case "mysql": return <Database className="h-3.5 w-3.5" />
    case "http":
    case "https": return <Globe className="h-3.5 w-3.5" />
    case "smb": return <HardDrive className="h-3.5 w-3.5" />
    case "ssh":
    case "ssh-tunnel": return <Server className="h-3.5 w-3.5" />
    default: return <Server className="h-3.5 w-3.5" />
  }
}

function StepNode({ step }: { step: KillChainStep }) {
  const isAuth = step.eventType === "auth"
  const cred = step.username
    ? `${step.username}${step.password ? ` / ${step.password}` : ""}`
    : null
  return (
    <div className="group relative shrink-0">
      <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${
        isAuth ? "border-red-400/30 bg-red-400/10 text-red-300" : "border-border bg-card text-muted-foreground"
      }`}>
        {serviceIcon(step.protocol)}
        <span className="font-mono">{step.nodeName ?? step.nodeId ?? "?"}</span>
        <span className="text-muted-foreground/60">:{step.dstPort}</span>
        {isAuth && <KeyRound className="h-3 w-3 text-red-400" />}
      </div>
      {/* hover detail */}
      <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-max max-w-xs rounded-lg border border-border bg-popover px-3 py-2 text-[11px] shadow-lg group-hover:block">
        <p className="font-medium text-foreground">{step.protocol.toUpperCase()} · {step.eventType}</p>
        {cred && <p className="text-red-300 font-mono mt-0.5">{cred}</p>}
        <p className="text-muted-foreground mt-0.5">{new Date(step.timestamp).toLocaleString()}</p>
      </div>
    </div>
  )
}

function StepTimeline({ chain }: { chain: KillChain }) {
  const tz = useTimezone()
  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground/60">
        Step-by-step path ({chain.steps.length})
      </p>
      <ol className="space-y-2">
        {/* Entry point */}
        <li className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-[10px] font-medium text-emerald-300">0</span>
          <div className="min-w-0">
            <p className="text-xs text-emerald-300 font-mono">cowrie SSH · entry</p>
            <p className="text-[10px] text-muted-foreground/60">The attacker got past the SSH honeypot and entered the internal network.</p>
          </div>
        </li>
        {chain.steps.map((step, i) => {
          const fields = stepLogFields(step.logdata)
          const isAuth = step.eventType === "auth"
          return (
            <li key={i} className="flex items-start gap-2.5">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                isAuth ? "bg-red-400/15 text-red-300" : "bg-muted text-muted-foreground"
              }`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-xs font-mono text-foreground">{step.nodeName ?? step.nodeId ?? "?"}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    {serviceIcon(step.protocol)}
                    {step.protocol.toUpperCase()} :{step.dstPort}
                  </span>
                  <span className={`rounded px-1 py-0.5 text-[10px] ${isAuth ? "bg-red-400/15 text-red-300" : "bg-muted/60 text-muted-foreground"}`}>
                    {isAuth ? "login attempt" : "connection"}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 font-mono">
                    {formatInTimezone(step.timestamp, tz, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                  </span>
                </div>
                {fields.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    {fields.map(([label, value]) => (
                      <span key={label} className="text-[11px] text-muted-foreground">
                        <span className="text-muted-foreground/50">{label}:</span>{" "}
                        <span className={`font-mono ${label === "Password" || label === "Username" ? "text-red-300" : "text-foreground"}`}>{value}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function ChainRow({ chain }: { chain: KillChain }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {chain.correlation === "probable" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              probable
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-400/10 px-2 py-0.5 text-[10px] font-medium text-slate-400">
              <Ghost className="h-3 w-3" /> internal
            </span>
          )}
          <span className="font-mono text-sm text-foreground">{chain.publicIp ?? "Unknown IP"}</span>
          {chain.sessionId && (
            <Link
              href={`/sessions/${chain.sessionId}`}
              className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline"
            >
              view session <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
          <span>{chain.nodesTouched} node{chain.nodesTouched === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>{chain.steps.length} steps</span>
          <span>·</span>
          <span>{formatDistanceToNow(new Date(chain.lastSeen), { addSuffix: true })}</span>
        </div>
      </div>

      {/* Horizontal kill-chain: cowrie → node → node → ... */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] text-emerald-300">
          <Terminal className="h-3.5 w-3.5" />
          <span className="font-mono">cowrie SSH</span>
        </div>
        {chain.steps.map((step, i) => (
          <div key={i} className="flex shrink-0 items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
            <StepNode step={step} />
          </div>
        ))}
      </div>

      {/* Expand to see the step-by-step detail of what each hop captured */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {expanded ? "Hide path" : "View detailed path"}
      </button>
      {expanded && <StepTimeline chain={chain} />}
    </div>
  )
}

export function KillChainView({ chains }: { chains: KillChain[] }) {
  if (chains.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-10 text-center">
        <Ghost className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No lateral movement toward the trap nodes yet.</p>
        <p className="text-[11px] text-muted-foreground/60">When an attacker jumps from cowrie into the internal network, their path will appear here.</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {chains.map(chain => <ChainRow key={chain.key} chain={chain} />)}
    </div>
  )
}
