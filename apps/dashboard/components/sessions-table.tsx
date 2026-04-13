"use client"

import { useState, useEffect } from "react"
import { formatDistanceToNow } from "date-fns"
import { ChevronDown, ChevronRight, Terminal, Clock, User, Key, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { EventTimeline } from "./event-timeline"
import type { HoneypotEvent } from "@/lib/api"

interface SessionItem {
  id: string
  srcIp: string
  startTime: string
  endTime?: string
  username?: string
  password?: string
  commandCount: number
}

interface SessionsTableProps {
  sessions: SessionItem[]
  showAll?: boolean
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export function SessionsTable({ sessions, showAll = false }: SessionsTableProps) {
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [sessionEvents, setSessionEvents] = useState<Record<string, HoneypotEvent[]>>({})
  const [loading, setLoading] = useState<string | null>(null)
  const displaySessions = showAll ? sessions : sessions.slice(0, 5)

  useEffect(() => {
    if (!expandedSession || sessionEvents[expandedSession]) return

    setLoading(expandedSession)
    fetch(`${API_URL}/sessions/${expandedSession}`)
      .then((res) => res.json())
      .then((data) => {
        setSessionEvents((prev) => ({ ...prev, [expandedSession]: data.events }))
      })
      .finally(() => setLoading(null))
  }, [expandedSession, sessionEvents])

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <h3 className="font-semibold text-foreground">Recent Sessions</h3>
        <p className="text-sm text-muted-foreground">
          Click on a session to view its event timeline
        </p>
      </div>
      <div className="divide-y divide-border">
        {displaySessions.map((session) => {
          const isExpanded = expandedSession === session.id
          const events = sessionEvents[session.id]
          const isLoading = loading === session.id

          return (
            <div key={session.id}>
              <button
                onClick={() =>
                  setExpandedSession(isExpanded ? null : session.id)
                }
                className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-secondary/50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-foreground">
                      {session.srcIp}
                    </span>
                    {session.username && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">
                        <User className="h-3 w-3" />
                        {session.username}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(session.startTime), {
                        addSuffix: true,
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Terminal className="h-3 w-3" />
                      {session.commandCount} commands
                    </span>
                    {session.password && (
                      <span className="flex items-center gap-1">
                        <Key className="h-3 w-3" />
                        {session.password}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className={cn(
                    "rounded-full px-2 py-1 text-xs font-medium",
                    session.endTime
                      ? "bg-muted text-muted-foreground"
                      : "bg-success/20 text-success"
                  )}
                >
                  {session.endTime ? "Closed" : "Active"}
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-border bg-secondary/30 p-4">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : events ? (
                    <EventTimeline events={events} />
                  ) : null}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!showAll && sessions.length > 5 && (
        <div className="border-t border-border p-4 text-center">
          <a
            href="/sessions"
            className="text-sm text-accent hover:underline"
          >
            View all {sessions.length} sessions
          </a>
        </div>
      )}
    </div>
  )
}
