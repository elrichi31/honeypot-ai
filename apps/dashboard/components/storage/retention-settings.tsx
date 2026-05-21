"use client"

import { useEffect, useState } from "react"
import { Clock, Save, Loader2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

type RetentionRow = {
  id: string; tableName: string; label: string
  retentionDays: number; enabled: boolean; updatedAt: string
}

type RowState = RetentionRow & { draft: string; saving: boolean; saved: boolean }

async function updateRetention(id: string, patch: { retentionDays?: number; enabled?: boolean }) {
  const res = await fetch(`/api/storage/retention/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  return res.ok ? res.json() as Promise<RetentionRow> : null
}

export function RetentionSettings() {
  const [rows, setRows]       = useState<RowState[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/storage/retention")
      .then(r => r.json())
      .then((d: unknown) => {
        if (Array.isArray(d)) {
          setRows(d.map((r: RetentionRow) => ({ ...r, draft: String(r.retentionDays), saving: false, saved: false })))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function setDraft(id: string, val: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, draft: val, saved: false } : r))
  }

  async function handleSave(id: string) {
    const row = rows.find(r => r.id === id)
    if (!row) return
    const days = parseInt(row.draft, 10)
    if (!days || days < 1) return
    setRows(prev => prev.map(r => r.id === id ? { ...r, saving: true } : r))
    const updated = await updateRetention(id, { retentionDays: days })
    setRows(prev => prev.map(r => r.id === id
      ? { ...r, ...(updated ?? {}), draft: String(updated?.retentionDays ?? days), saving: false, saved: !!updated }
      : r
    ))
    if (updated) {
      setTimeout(() => setRows(prev => prev.map(r => r.id === id ? { ...r, saved: false } : r)), 2000)
    }
  }

  async function handleToggle(id: string) {
    const row = rows.find(r => r.id === id)
    if (!row) return
    setRows(prev => prev.map(r => r.id === id ? { ...r, saving: true } : r))
    const updated = await updateRetention(id, { enabled: !row.enabled })
    setRows(prev => prev.map(r => r.id === id
      ? { ...r, ...(updated ?? {}), draft: String(updated?.retentionDays ?? r.retentionDays), saving: false, saved: false }
      : r
    ))
  }

  const isDirty = (row: RowState) => parseInt(row.draft, 10) !== row.retentionDays

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

      <div className="divide-y divide-border/40">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-yellow-400" />
          </div>
        ) : rows.map(row => (
          <div key={row.id} className="flex items-center gap-4 px-4 py-3">
            {/* Enable toggle */}
            <button
              onClick={() => handleToggle(row.id)}
              disabled={row.saving}
              title={row.enabled ? "Disable retention" : "Enable retention"}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${row.enabled ? "bg-emerald-500" : "bg-white/10"}`}
            >
              <span className={`absolute top-1 h-3 w-3 rounded-full bg-white shadow transition-transform ${row.enabled ? "translate-x-5" : "translate-x-1"}`} />
            </button>

            {/* Label */}
            <span className={`flex-1 text-sm ${row.enabled ? "text-foreground" : "text-muted-foreground"}`}>
              {row.label}
            </span>

            {/* Days input + Save */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={3650}
                value={row.draft}
                onChange={e => setDraft(row.id, e.target.value)}
                disabled={!row.enabled || row.saving}
                className="w-20 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-center font-mono text-sm text-foreground outline-none focus:border-white/20 disabled:opacity-40"
              />
              <span className="text-xs text-muted-foreground w-6">days</span>
              <Button
                size="sm"
                variant={isDirty(row) ? "default" : "outline"}
                onClick={() => handleSave(row.id)}
                disabled={row.saving || !isDirty(row) || !row.enabled}
                className="h-7 w-16 text-xs"
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
