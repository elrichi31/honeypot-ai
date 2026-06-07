"use client"

import Link from "next/link"
import { Terminal, ChevronRight, Database, Server, Globe, HardDrive, KeyRound, ExternalLink, Ghost } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { KillChain, KillChainStep } from "@/lib/api/deception"

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
        <span className="font-mono">{step.nodeId ?? "?"}</span>
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

function ChainRow({ chain }: { chain: KillChain }) {
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
              <Ghost className="h-3 w-3" /> interno
            </span>
          )}
          <span className="font-mono text-sm text-foreground">{chain.publicIp ?? "IP desconocida"}</span>
          {chain.sessionId && (
            <Link
              href={`/sessions/${chain.sessionId}`}
              className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline"
            >
              ver sesión <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
          <span>{chain.nodesTouched} nodo{chain.nodesTouched === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>{chain.steps.length} pasos</span>
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
    </div>
  )
}

export function KillChainView({ chains }: { chains: KillChain[] }) {
  if (chains.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-10 text-center">
        <Ghost className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Aún no hay movimiento lateral hacia los nodos trampa.</p>
        <p className="text-[11px] text-muted-foreground/60">Cuando un atacante salte de cowrie a la red interna, su recorrido aparecerá aquí.</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {chains.map(chain => <ChainRow key={chain.key} chain={chain} />)}
    </div>
  )
}
