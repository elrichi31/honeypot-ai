"use client"

import { useEffect, useState } from "react"
import { Clock, Save, Loader2, Check, CheckCircle2, AlertTriangle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

type RetentionRow = {
  id: string; tableName: string; label: string
  retentionDays: number; enabled: boolean; updatedAt: string
  oldestDaysAgo: number | null
  pendingRows: number | null
}
type RetentionRun = {
  id: string; startedAt: string; finishedAt: string | null
  rowsDeleted: number; perTable: Record<string, number>; ok: boolean; error: string | null
}
type RowState = RetentionRow & { draft: string; saving: boolean; saved: boolean }

function OldestBadge({ oldestDaysAgo, retentionDays, enabled, pendingRows }: {
  oldestDaysAgo: number | null
  retentionDays: number
  enabled: boolean
  pendingRows: number | null
}) {
  if (!enabled) return null
  if (oldestDaysAgo === null) return (
    <span className="text-[11px] text-muted-foreground/40 w-48 text-right">no data</span>
  )
  const daysLeft = retentionDays - oldestDaysAgo
  const urgent = daysLeft <= 7
  const pending = pendingRows ?? 0
  return (
    <span className="text-[11px] text-right w-48 tabular-nums">
      <span className="text-muted-foreground">oldest {oldestDaysAgo}d ago · </span>
      {pending > 0 ? (
        <span className="text-amber-400 font-medium">borrará {pending.toLocaleString()} fila{pending === 1 ? "" : "s"}</span>
      ) : (
        <span className={urgent ? "text-red-400 font-medium" : "text-muted-foreground"}>
          {daysLeft <= 0 ? "al día" : `${daysLeft}d left`}
        </span>
      )}
    </span>
  )
}

function LastRunBadge({ run }: { run: RetentionRun | null }) {
  if (!run) {
    return <span className="text-[11px] text-muted-foreground/50">Aún no se ha ejecutado</span>
  }
  const when = formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })
  const tablesPurged = Object.entries(run.perTable ?? {})
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${t}: ${n.toLocaleString()}`)
    .join(" · ")
  return (
    <div className="flex flex-col items-end gap-0.5 text-right">
      <span className="inline-flex items-center gap-1.5 text-[11px]">
        {run.ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
        )}
        <span className="text-muted-foreground">Última purga {when}</span>
        <span className={run.ok ? "text-emerald-400" : "text-red-400"}>
          · {run.rowsDeleted.toLocaleString()} filas
        </span>
      </span>
      {!run.ok && run.error && (
        <span className="text-[10px] text-red-400/80 max-w-xs truncate" title={run.error}>{run.error}</span>
      )}
      {run.ok && tablesPurged && (
        <span className="text-[10px] text-muted-foreground/60 max-w-md truncate" title={tablesPurged}>{tablesPurged}</span>
      )}
    </div>
  )
}

function NextRunBanner({ nextRunAt, totalPending }: { nextRunAt: string | null; totalPending: number }) {
  // The job runs hourly; if the computed next time is already past, it's due on
  // the next tick — show "pronto" rather than a negative time.
  const next = nextRunAt ? new Date(nextRunAt) : null
  const when = next
    ? (next.getTime() > Date.now() ? formatDistanceToNow(next, { addSuffix: true }) : "pronto")
    : "en la próxima hora"
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 bg-muted/20 px-4 py-2">
      <span className="text-[11px] text-muted-foreground">
        Próxima purga <span className="text-foreground">{when}</span>
      </span>
      <span className="text-[11px] tabular-nums">
        {totalPending > 0 ? (
          <span className="text-amber-400">se borrarán ~{totalPending.toLocaleString()} filas</span>
        ) : (
          <span className="text-muted-foreground/60">nada por purgar</span>
        )}
      </span>
    </div>
  )
}

async function callApi(id: string, patch: { retentionDays?: number; enabled?: boolean }) {
  const res = await fetch(`/api/storage/retention/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  return res.ok ? (res.json() as Promise<RetentionRow>) : null
}

export function RetentionSettings() {
  const [rows, setRows]       = useState<RowState[]>([])
  const [lastRun, setLastRun] = useState<RetentionRun | null>(null)
  const [nextRunAt, setNextRunAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/storage/retention")
      .then(r => r.json())
      .then((d: { settings?: RetentionRow[]; lastRun?: RetentionRun | null; nextRunAt?: string | null }) => {
        if (Array.isArray(d.settings)) {
          setRows(d.settings.map((r) => ({ ...r, draft: String(r.retentionDays), saving: false, saved: false })))
        }
        setLastRun(d.lastRun ?? null)
        setNextRunAt(d.nextRunAt ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Total rows the next purge will delete across all enabled tables.
  const totalPending = rows.reduce((sum, r) => sum + (r.enabled ? (r.pendingRows ?? 0) : 0), 0)

  function patch(id: string, changes: Partial<RowState>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...changes } : r))
  }

  async function handleToggle(id: string, enabled: boolean) {
    patch(id, { saving: true })
    const updated = await callApi(id, { enabled })
    patch(id, { ...(updated ?? {}), saving: false })
  }

  async function handleSave(id: string) {
    const row = rows.find(r => r.id === id)
    if (!row) return
    const days = parseInt(row.draft, 10)
    if (!days || days < 1) return
    patch(id, { saving: true })
    const updated = await callApi(id, { retentionDays: days })
    patch(id, {
      ...(updated ?? {}),
      draft: String(updated?.retentionDays ?? days),
      saving: false,
      saved: !!updated,
    })
    if (updated) setTimeout(() => patch(id, { saved: false }), 2000)
  }

  const isDirty = (row: RowState) => parseInt(row.draft, 10) !== row.retentionDays

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10">
          <Clock className="h-4 w-4 text-yellow-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">Data Retention</h2>
          <p className="text-[11px] text-muted-foreground">
            Records older than the configured days are purged automatically every hour
          </p>
        </div>
        <LastRunBadge run={lastRun} />
      </div>

      {!loading && (
        <NextRunBanner nextRunAt={nextRunAt} totalPending={totalPending} />
      )}

      <div className="divide-y divide-border/40">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-yellow-400" />
          </div>
        ) : rows.map(row => (
          <div key={row.id} className="flex items-center gap-4 px-4 py-3">
            <Switch
              checked={row.enabled}
              disabled={row.saving}
              onCheckedChange={checked => handleToggle(row.id, checked)}
            />
            <span className={`flex-1 text-sm ${row.enabled ? "text-foreground" : "text-muted-foreground/50"}`}>
              {row.label}
            </span>
            <OldestBadge oldestDaysAgo={row.oldestDaysAgo} retentionDays={row.retentionDays} enabled={row.enabled} pendingRows={row.pendingRows} />
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={3650}
                value={row.draft}
                onChange={e => patch(row.id, { draft: e.target.value, saved: false })}
                disabled={!row.enabled || row.saving}
                className="w-20 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-center font-mono text-sm text-foreground outline-none focus:border-white/20 disabled:opacity-40"
              />
              <span className="text-xs text-muted-foreground w-6">days</span>
              <Button
                size="sm"
                variant={isDirty(row) ? "default" : "outline"}
                onClick={() => handleSave(row.id)}
                disabled={row.saving || !isDirty(row) || !row.enabled}
                className="h-7 w-[72px] text-xs"
              >
                {row.saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : row.saved ? (
                  <><Check className="h-3 w-3 mr-1" />Saved</>
                ) : (
                  <><Save className="h-3 w-3 mr-1" />Save</>
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
