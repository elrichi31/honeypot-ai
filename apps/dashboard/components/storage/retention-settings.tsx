"use client"

import { useEffect, useState } from "react"
import { Clock, Loader2 } from "lucide-react"

type RetentionRow = {
  id: string; tableName: string; label: string
  retentionDays: number; enabled: boolean; updatedAt: string
}

function Row({ row, onUpdate }: { row: RetentionRow; onUpdate: (updated: RetentionRow) => void }) {
  const [days, setDays]     = useState(String(row.retentionDays))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty]   = useState(false)

  async function save(patch: Partial<{ retentionDays: number; enabled: boolean }>) {
    setSaving(true)
    const res = await fetch(`/api/storage/retention/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (res.ok) { const d = await res.json(); onUpdate(d) }
    setSaving(false)
    setDirty(false)
  }

  function handleDaysBlur() {
    const n = parseInt(days, 10)
    if (!n || n < 1 || n === row.retentionDays) { setDays(String(row.retentionDays)); setDirty(false); return }
    save({ retentionDays: n })
  }

  return (
    <div className="flex items-center gap-4 py-2.5 border-b border-border/40 last:border-0">
      {/* Toggle */}
      <button
        onClick={() => save({ enabled: !row.enabled })}
        disabled={saving}
        className={`relative h-4 w-7 rounded-full transition-colors shrink-0 ${row.enabled ? "bg-emerald-500" : "bg-white/10"}`}
      >
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${row.enabled ? "translate-x-3.5" : "translate-x-0.5"}`} />
      </button>

      <span className="flex-1 text-sm text-foreground">{row.label}</span>
      <span className="font-mono text-[11px] text-muted-foreground/50 w-24 hidden sm:block">{row.tableName}</span>

      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          max={3650}
          value={days}
          onChange={e => { setDays(e.target.value); setDirty(true) }}
          onBlur={handleDaysBlur}
          disabled={!row.enabled}
          className="w-16 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-center font-mono text-xs text-foreground outline-none focus:border-white/20 disabled:opacity-40"
        />
        <span className="text-[11px] text-muted-foreground">days</span>
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {dirty && !saving && <span className="text-[10px] text-yellow-400">unsaved</span>}
      </div>
    </div>
  )
}

export function RetentionSettings() {
  const [rows, setRows]     = useState<RetentionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/storage/retention")
      .then(r => r.json())
      .then((d: unknown) => setRows(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function handleUpdate(updated: RetentionRow) {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r))
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10">
          <Clock className="h-4 w-4 text-yellow-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Data Retention</h2>
          <p className="text-[11px] text-muted-foreground">
            Records older than the configured days are deleted automatically every hour
          </p>
        </div>
      </div>

      <div className="px-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-yellow-400" />
          </div>
        ) : (
          rows.map(row => <Row key={row.id} row={row} onUpdate={handleUpdate} />)
        )}
      </div>
    </div>
  )
}
