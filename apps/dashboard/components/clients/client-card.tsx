"use client"

import Link from "next/link"
import { Pencil, Trash2, Radio, Activity, Cpu } from "lucide-react"
import type { Client } from "@/lib/api"
import { useT } from "@/components/locale-provider"

type ClientStats = { sensors: number; online: number; events: number }

type Props = {
  client: Client
  stats: ClientStats
  onEdit: (client: Client) => void
  onDelete: (client: Client) => void
}

function HealthDot({ online, total }: { online: number; total: number }) {
  if (total === 0) return <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
  if (online === 0) return <span className="h-2 w-2 rounded-full bg-red-500" />
  if (online < total) return <span className="h-2 w-2 rounded-full bg-yellow-400" />
  return <span className="h-2 w-2 rounded-full bg-emerald-400" />
}

function healthLabel(online: number, total: number): string {
  if (total === 0) return "no sensors"
  if (online === 0) return "offline"
  if (online < total) return `${online}/${total} online`
  return "all online"
}

function healthColor(online: number, total: number): string {
  if (total === 0 || online === 0) return "text-muted-foreground"
  if (online < total) return "text-yellow-400"
  return "text-emerald-400"
}

export function ClientCard({ client, stats, onEdit, onDelete }: Props) {
  const t = useT()

  return (
    <Link
      href={`/clients/${client.slug}`}
      className="group relative flex flex-col rounded-xl border border-border/60 bg-card transition-all hover:border-border hover:shadow-lg hover:shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <HealthDot online={stats.online} total={stats.sensors} />
            <span className="truncate font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
              {client.name}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-muted-foreground">{client.slug}</span>
            <span className="rounded border border-border/60 bg-background px-1.5 py-px font-mono text-[10px] text-foreground/70 leading-tight">
              {client.code}
            </span>
          </div>
        </div>

        {/* Action buttons — stop propagation so clicks don't navigate */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.preventDefault(); onEdit(client) }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={t("clients.card.edit")}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); onDelete(client) }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-400/10 hover:text-red-400 transition-colors"
            title={t("clients.card.delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Description — only shown when set */}
      {client.description ? (
        <p className="px-4 pb-3 text-sm text-muted-foreground line-clamp-2">{client.description}</p>
      ) : null}

      {/* Divider */}
      <div className="mx-4 border-t border-border/40" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-0 p-4 pt-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Activity className="h-3 w-3" />
            {t("clients.card.events")}
          </div>
          <p className="text-xl font-bold tabular-nums text-foreground">
            {stats.events >= 1_000_000
              ? `${(stats.events / 1_000_000).toFixed(1)}M`
              : stats.events >= 1_000
              ? `${(stats.events / 1_000).toFixed(1)}k`
              : stats.events.toString()}
          </p>
        </div>

        <div className="flex flex-col gap-1 border-l border-border/40 pl-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Cpu className="h-3 w-3" />
            {t("clients.card.sensors")}
          </div>
          <p className="text-xl font-bold tabular-nums text-foreground">{stats.sensors}</p>
        </div>

        <div className="flex flex-col gap-1 border-l border-border/40 pl-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Radio className="h-3 w-3" />
            {t("clients.card.online")}
          </div>
          <p className={`text-xl font-bold tabular-nums ${healthColor(stats.online, stats.sensors)}`}>
            {stats.online}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {healthLabel(stats.online, stats.sensors)}
            </span>
          </p>
        </div>
      </div>

      {/* Forwarding badge — only visible when active */}
      {client.forwardUrl ? (
        <div className="mx-4 mb-4 flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          <span className="truncate font-mono text-[11px] text-cyan-400">{client.forwardUrl}</span>
        </div>
      ) : null}
    </Link>
  )
}
