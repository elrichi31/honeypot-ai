"use client"

import { useEffect, useState } from "react"
import { Loader2, Terminal, ShieldCheck, ShieldAlert, Clock, User, Key, Cpu } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatTs, formatDuration } from "@/lib/formatting"
import { useT } from "@/components/locale-provider"

type SessionEvent = {
  id: string
  eventType: string
  eventTs: string
  command: string | null
  message: string | null
  username: string | null
  password: string | null
  success: boolean | null
}

type SessionDetail = {
  id: string
  srcIp: string
  protocol: string
  username: string | null
  password: string | null
  loginSuccess: boolean | null
  hassh: string | null
  clientVersion: string | null
  startedAt: string
  endedAt: string | null
  sessionType: string
  durationSec: number | null
  eventCount: number
  commandCount: number
  events?: SessionEvent[]
}

type Props = {
  sessionId: string | null
  onClose: () => void
}


const EVENT_COLOR: Record<string, string> = {
  "cowrie.login.success":  "text-red-400",
  "cowrie.login.failed":   "text-muted-foreground/60",
  "cowrie.command.input":  "text-green-300/90",
  "cowrie.session.closed": "text-blue-300/70",
  "cowrie.session.connect":"text-cyan-300/70",
}

export function ClientSessionModal({ sessionId, onClose }: Props) {
  const t = useT()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(false)

  useEffect(() => {
    if (!sessionId) return
    setSession(null)
    setError(false)
    setLoading(true)
    const controller = new AbortController()
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: unknown) => {
        if (d && typeof d === "object") setSession(d as SessionDetail)
        else setError(true)
        setLoading(false)
      })
      .catch((err) => {
        if (err?.name === "AbortError") return
        setError(true)
        setLoading(false)
      })
    return () => controller.abort()
  }, [sessionId])

  const events: SessionEvent[] = Array.isArray((session as any)?.events)
    ? (session as any).events
    : []

  return (
    <Dialog open={!!sessionId} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10">
              <Terminal className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <DialogTitle className="font-mono text-sm">
                Session {session?.srcIp ?? "…"}
              </DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {session ? `${session.protocol.toUpperCase()} · ${session.sessionType}` : t("clients.session.loading")}
              </p>
            </div>
            {session && (
              session.loginSuccess
                ? <ShieldAlert className="ml-auto h-4 w-4 text-red-400 shrink-0" />
                : <ShieldCheck className="ml-auto h-4 w-4 text-emerald-400 shrink-0" />
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              {t("clients.session.loadError")}
            </div>
          )}

          {session && !loading && (
            <div className="divide-y divide-border/50">
              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-3">
                {[
                  { icon: User,     label: t("clients.session.field.username"), value: session.username ?? "—" },
                  { icon: Key,      label: t("clients.session.field.password"),  value: session.password ?? "—" },
                  { icon: Clock,    label: t("clients.session.field.duration"),  value: session.durationSec != null ? formatDuration(session.durationSec) : "—" },
                  { icon: Cpu,      label: t("clients.session.field.client"),    value: session.clientVersion ?? "—" },
                  { icon: Terminal, label: t("clients.session.field.hassh"),     value: session.hassh ? session.hassh.slice(0, 16) + "…" : "—" },
                  { icon: Clock,    label: t("clients.session.field.started"),   value: formatTs(session.startedAt) },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      <p className="font-mono text-xs text-foreground truncate">{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Stats strip */}
              <div className="flex gap-6 px-5 py-3 bg-muted/20">
                <div className="text-center">
                  <p className="text-sm font-semibold tabular-nums text-foreground">{session.eventCount}</p>
                  <p className="text-[10px] text-muted-foreground">{t("clients.session.stats.events")}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold tabular-nums text-foreground">{session.commandCount}</p>
                  <p className="text-[10px] text-muted-foreground">{t("clients.session.stats.commands")}</p>
                </div>
                <div className="text-center">
                  <p className={`text-sm font-semibold ${session.loginSuccess ? "text-red-400" : "text-emerald-400"}`}>
                    {session.loginSuccess ? t("clients.session.stats.compromised") : t("clients.session.stats.blocked")}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t("clients.session.stats.outcome")}</p>
                </div>
              </div>

              {/* Event log */}
              {events.length > 0 && (
                <div className="bg-[#0d0d0f] font-mono text-xs">
                  {events.map(ev => (
                    <div
                      key={ev.id}
                      className="flex gap-3 border-b border-white/[0.04] px-4 py-1.5"
                    >
                      <span className="text-muted-foreground/50 shrink-0 w-[148px]">{formatTs(ev.eventTs)}</span>
                      <span className={`shrink-0 ${EVENT_COLOR[ev.eventType] ?? "text-muted-foreground/70"}`}>
                        {ev.eventType.replace("cowrie.", "")}
                      </span>
                      {(ev.command || ev.message) && (
                        <span className="text-green-300/80 truncate">
                          {ev.command || ev.message}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {events.length === 0 && (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  {t("clients.session.noEvents")}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
