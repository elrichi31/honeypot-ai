"use client"

import { useEffect, useState } from "react"
import { Ban, Plus, Trash2, Loader2, ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTs } from "@/lib/formatting"
import { Surface } from "@/components/ui/surface"

type BlockedEntry = {
  id: string; ip: string; reason: string; autoBlocked: boolean; blockedAt: string
}

const REASON_STYLE: Record<string, { label: string; color: string }> = {
  injection:   { label: "Injection",   color: "text-red-400"    },
  brute_force: { label: "Brute Force", color: "text-purple-400" },
  manual:      { label: "Manual",      color: "text-muted-foreground" },
}

export function BlockedIpsTable() {
  const [items, setItems]           = useState<BlockedEntry[]>([])
  const [loading, setLoading]       = useState(true)
  const [ip, setIp]                 = useState("")
  const [error, setError]           = useState("")
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch("/api/defense/blocked")
      .then(r => r.json())
      .then((d: unknown) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleBlock(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!ip.trim()) return
    setSaving(true)
    const res = await fetch("/api/defense/blocked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: ip.trim(), reason: "manual" }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? "Error blocking IP"); return }
    setIp("")
    load()
  }

  async function handleUnblock(id: string) {
    setDeletingId(id)
    await fetch(`/api/defense/blocked/${id}`, { method: "DELETE" })
    setDeletingId(null)
    load()
  }

  return (
    <Surface>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-400/10">
            <Ban className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Blocked IPs</h2>
            <p className="text-[11px] text-muted-foreground">
              {items.length > 0 ? `${items.length} IP${items.length !== 1 ? "s" : ""} blocked — all requests return 403` : "No IPs blocked"}
            </p>
          </div>
        </div>
      </div>

      {/* Manual block form */}
      <form onSubmit={handleBlock} className="flex items-start gap-2 px-4 py-3 border-b border-border/40 bg-[#0d0d0f]">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <input
            type="text"
            value={ip}
            onChange={e => { setIp(e.target.value); setError("") }}
            placeholder="Block an IP manually — e.g. 1.2.3.4"
            className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-white/20"
          />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
        <Button type="submit" size="sm" disabled={saving || !ip.trim()} variant="destructive" className="h-[30px] gap-1.5">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Block
        </Button>
      </form>

      {/* Table */}
      <div className="min-h-[120px] font-mono text-xs bg-[#0d0d0f] rounded-b-xl overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-red-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <ShieldOff className="h-6 w-6 text-muted-foreground/30" />
            <p className="text-[11px] text-muted-foreground">No IPs blocked yet — injections and brute force are auto-blocked</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60 w-[160px]">IP</th>
                <th className="px-4 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60 w-[110px]">REASON</th>
                <th className="px-4 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60 w-[80px]">SOURCE</th>
                <th className="px-4 py-1.5 text-right text-[10px] font-medium text-muted-foreground/60 w-[140px]">BLOCKED AT</th>
                <th className="px-4 py-1.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const style = REASON_STYLE[item.reason] ?? REASON_STYLE.manual
                return (
                  <tr key={item.id} className={`border-b border-white/[0.04] ${i % 2 ? "bg-white/[0.01]" : ""}`}>
                    <td className="px-4 py-1.5 text-red-300/90 font-mono">{item.ip}</td>
                    <td className={`px-4 py-1.5 font-medium ${style.color}`}>{style.label}</td>
                    <td className="px-4 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${item.autoBlocked ? "bg-orange-400/10 text-orange-400" : "bg-muted/40 text-muted-foreground"}`}>
                        {item.autoBlocked ? "auto" : "manual"}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-right text-muted-foreground/50 whitespace-nowrap">{formatTs(item.blockedAt)}</td>
                    <td className="px-4 py-1.5 text-right">
                      <button
                        onClick={() => handleUnblock(item.id)}
                        disabled={deletingId === item.id}
                        title="Unblock"
                        className="text-muted-foreground/40 hover:text-emerald-400 transition-colors disabled:opacity-30"
                      >
                        {deletingId === item.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Trash2 className="h-3 w-3" />}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </Surface>
  )
}
