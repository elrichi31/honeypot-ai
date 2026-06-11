"use client"

import Link from "next/link"
import { Pencil, Trash2 } from "lucide-react"
import type { Client } from "@/lib/api"
import { useT } from "@/components/locale-provider"

type ClientStats = { sensors: number; online: number; events: number }

type Props = {
  client: Client
  stats: ClientStats
  onEdit: (client: Client) => void
  onDelete: (client: Client) => void
}

export function ClientCard({ client, stats, onEdit, onDelete }: Props) {
  const t = useT()
  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4 space-y-3 transition-colors hover:border-border hover:bg-background">
      <div>
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/clients/${client.slug}`}
            className="font-semibold text-foreground hover:text-cyan-400 transition-colors"
          >
            {client.name}
          </Link>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(client)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={t("clients.card.edit")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(client)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-400/10 hover:text-red-400 transition-colors"
              title={t("clients.card.delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <p className="font-mono">{client.slug}</p>
          <span className="rounded border border-border/70 bg-card px-1.5 py-0.5 font-mono text-[10px] text-foreground/90">
            {client.code}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground min-h-10">
        {client.description || t("clients.card.noDescription")}
      </p>
      <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("clients.card.forwarding")}</p>
        <p className="mt-1 truncate font-mono text-xs text-foreground">
          {client.forwardUrl || t("clients.card.disabled")}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("clients.card.sensors")}</p>
          <p className="font-semibold text-foreground">{stats.sensors}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("clients.card.online")}</p>
          <p className="font-semibold text-foreground">{stats.online}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("clients.card.events")}</p>
          <p className="font-semibold text-foreground">{stats.events.toLocaleString()}</p>
        </div>
      </div>
      <Link
        href={`/clients/${client.slug}`}
        className="block text-center text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors pt-1"
      >
        {t("clients.card.open")}
      </Link>
    </div>
  )
}
