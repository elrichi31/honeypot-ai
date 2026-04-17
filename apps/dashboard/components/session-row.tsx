"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
  ChevronDown, ChevronRight, Terminal, Clock, User, Key,
  Loader2, ExternalLink, ShieldX,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDuration, countryFlag } from "@/lib/formatting"
import { classify, type SessionItem } from "@/lib/session-classify"
import { EventTimeline } from "./event-timeline"
import type { HoneypotEvent } from "@/lib/api"

export function SessionRow({ session }: { session: SessionItem }) {
  const [expanded, setExpanded] = useState(false)
  const [events, setEvents] = useState<HoneypotEvent[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!expanded || events !== null) return
    setLoading(true)
    fetch(`/api/sessions/${session.id}`)
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .finally(() => setLoading(false))
  }, [expanded, events, session.id])

  const cls = classify(session)
  const Icon = cls.icon

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
      >
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">
              {session.srcIp}
            </span>
            {session.country && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{countryFlag(session.country)}</span>
                <span>{session.countryName}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
              <ShieldX className="h-3 w-3" /> Comprometido
            </span>
            <span className={cn("inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium", cls.bg, cls.color)}>
              <Icon className="h-3 w-3" />
              {cls.label}
            </span>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">{cls.summary}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(session.startTime), { addSuffix: true })}
            </span>
            {session.duration !== null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(session.duration)}
              </span>
            )}
            {session.username && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span className="font-mono">{session.username}</span>
              </span>
            )}
            {session.password && (
              <span className="flex items-center gap-1">
                <Key className="h-3 w-3" />
                <span className="font-mono">{session.password}</span>
              </span>
            )}
            {session.clientVersion && (
              <span className="hidden xl:flex items-center gap-1 max-w-[200px] truncate">
                <Terminal className="h-3 w-3 shrink-0" />
                {session.clientVersion.replace("SSH-2.0-", "")}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Link
            href={`/sessions/${session.id}`}
            className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            Replay
          </Link>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-secondary/20 p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : events && events.length > 0 ? (
            <EventTimeline events={events} />
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">Sin eventos registrados.</p>
          )}
        </div>
      )}
    </div>
  )
}
