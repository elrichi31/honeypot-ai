"use client"

import { apiFetch } from "@/lib/client-fetch"
import { useEffect, useState, useCallback } from "react"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import { MonitorSmartphone, Loader2, Trash2, LogOut, RefreshCw, ShieldAlert } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"

type SessionRow = {
  id: string
  userId: string
  email: string
  name: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  expiresAt: string
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return "—"
  let browser = "Browser"
  if (/Edg\//.test(ua)) browser = "Edge"
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera"
  else if (/Chrome\//.test(ua)) browser = "Chrome"
  else if (/Firefox\//.test(ua)) browser = "Firefox"
  else if (/Safari\//.test(ua)) browser = "Safari"
  let os = ""
  if (/Windows/.test(ua)) os = "Windows"
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS"
  else if (/Android/.test(ua)) os = "Android"
  else if (/iPhone|iPad/.test(ua)) os = "iOS"
  else if (/Linux/.test(ua)) os = "Linux"
  return os ? `${browser} · ${os}` : browser
}

export default function SessionsAdminPage() {
  const tz = useTimezone()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/sessions-admin")
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions ?? [])
        setCurrentUserId(data.currentSessionUserId ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function revokeOne(id: string) {
    setPendingId(id)
    setMessage(null)
    try {
      const res = await apiFetch(`/api/sessions-admin/${encodeURIComponent(id)}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setSessions((cur) => cur.filter((s) => s.id !== id))
      setMessage("Session revoked.")
    } catch {
      setMessage("Could not revoke the session.")
    } finally {
      setPendingId(null)
    }
  }

  async function revokeUser(userId: string, email: string) {
    setPendingId(userId)
    setMessage(null)
    try {
      const res = await apiFetch("/api/sessions-admin/revoke-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) throw new Error()
      setSessions((cur) => cur.filter((s) => s.userId !== userId))
      setMessage(`All sessions for ${email} were revoked.`)
    } catch {
      setMessage("Could not revoke the sessions.")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <PageShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Active sessions</h1>
          <p className="text-sm text-muted-foreground">
            Dashboard login sessions. Revoke them to force a sign-out.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/40"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
        <span>
          Due to the cookie cache (5 min), a revoked session may stay valid for up to ~5 minutes
          before the user is kicked out.
        </span>
      </div>

      {message && <p className="mb-3 text-sm text-muted-foreground">{message}</p>}

      <Surface className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-16 text-center">
            <MonitorSmartphone className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No active sessions.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="text-xs font-medium text-foreground">
                      {s.name || "—"}
                      {s.userId === currentUserId && (
                        <span className="ml-2 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">you</span>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">{s.email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.ipAddress ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{parseUserAgent(s.userAgent)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatInTimezone(s.createdAt, tz, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatInTimezone(s.expiresAt, tz, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => revokeOne(s.id)}
                        disabled={pendingId === s.id}
                        title="Revoke this session"
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" /> Revoke
                      </button>
                      <button
                        onClick={() => revokeUser(s.userId, s.email)}
                        disabled={pendingId === s.userId}
                        title="Close all sessions for this user"
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      >
                        <LogOut className="h-3 w-3" /> All
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Surface>
    </PageShell>
  )
}
