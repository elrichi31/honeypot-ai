"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, Plus, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTs } from "@/lib/formatting"
import { Surface } from "@/components/ui/surface"

type AllowEntry = { id: string; entry: string; label: string; createdAt: string }

const PLACEHOLDER_EXAMPLES = ["1.2.3.4", "203.0.113.0/24"]

export function DefenseAllowlist() {
  const [items, setItems]       = useState<AllowEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [entry, setEntry]       = useState("")
  const [label, setLabel]       = useState("")
  const [error, setError]       = useState("")
  const [saving, setSaving]     = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch("/api/defense/allowlist")
      .then(r => r.json())
      .then((d: unknown) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!entry.trim()) return
    setSaving(true)
    const res = await fetch("/api/defense/allowlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry: entry.trim(), label: label.trim() }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? "Error adding entry"); return }
    setEntry(""); setLabel("")
    load()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await fetch(`/api/defense/allowlist/${id}`, { method: "DELETE" })
    setDeletingId(null)
    load()
  }

  return (
    <Surface>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">IP Allowlist</h2>
          <p className="text-[11px] text-muted-foreground">
            IPs and CIDR ranges excluded from detection · RFC 1918 always excluded
          </p>
        </div>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex items-start gap-2 px-4 py-3 border-b border-border/40 bg-[#0d0d0f]">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <input
            type="text"
            value={entry}
            onChange={e => { setEntry(e.target.value); setError("") }}
            placeholder={`IP or CIDR — e.g. ${PLACEHOLDER_EXAMPLES[0]}, ${PLACEHOLDER_EXAMPLES[1]}`}
            className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-white/20"
          />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="w-40 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-white/20"
        />
        <Button type="submit" size="sm" disabled={saving || !entry.trim()} className="h-[30px] gap-1.5">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add
        </Button>
      </form>

      {/* Table */}
      <div className="min-h-[120px] font-mono text-xs bg-[#0d0d0f] rounded-b-xl overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-emerald-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <ShieldCheck className="h-6 w-6 text-muted-foreground/30" />
            <p className="text-[11px] text-muted-foreground">No custom entries — only RFC 1918 ranges are excluded</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60 w-[180px]">ENTRY</th>
                <th className="px-4 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60">LABEL</th>
                <th className="px-4 py-1.5 text-right text-[10px] font-medium text-muted-foreground/60 w-[140px]">ADDED</th>
                <th className="px-4 py-1.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className={`border-b border-white/[0.04] ${i % 2 ? "bg-white/[0.01]" : ""}`}>
                  <td className="px-4 py-1.5 text-emerald-300/90 font-mono">{item.entry}</td>
                  <td className="px-4 py-1.5 text-muted-foreground/70 truncate max-w-[200px]">{item.label || "—"}</td>
                  <td className="px-4 py-1.5 text-right text-muted-foreground/50 whitespace-nowrap">{formatTs(item.createdAt)}</td>
                  <td className="px-4 py-1.5 text-right">
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="text-muted-foreground/40 hover:text-red-400 transition-colors disabled:opacity-30"
                    >
                      {deletingId === item.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Trash2 className="h-3 w-3" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Surface>
  )
}
