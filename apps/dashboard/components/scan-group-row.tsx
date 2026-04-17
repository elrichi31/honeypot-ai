"use client"

import { useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
  ChevronDown, ChevronRight, Terminal, Clock, User, Key,
  ExternalLink, Shield, ScanLine,
} from "lucide-react"
import { formatDuration, countryFlag } from "@/lib/formatting"
import { type ScanGroup } from "@/lib/session-classify"

const CRED_PREVIEW = 5

export function ScanGroupRow({ group }: { group: ScanGroup }) {
  const [expanded, setExpanded] = useState(false)
  const hasCredentials = group.credentials.length > 0

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
              {group.srcIp}
            </span>
            {group.country && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{countryFlag(group.country)}</span>
                <span>{group.countryName}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" /> Bloqueado
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <ScanLine className="h-3 w-3" />
              {group.attempts} {group.attempts === 1 ? "intento" : "intentos"}
            </span>
            {hasCredentials && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/15 px-2 py-0.5 text-xs font-medium text-yellow-400">
                <Key className="h-3 w-3" />
                {group.credentials.length} {group.credentials.length === 1 ? "credencial" : "credenciales"}
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(group.lastSeen), { addSuffix: true })}
            </span>
            {group.clientVersions.length > 0 && (
              <span className="hidden xl:flex items-center gap-1 max-w-[280px] truncate">
                <Terminal className="h-3 w-3 shrink-0" />
                {group.clientVersions[0].replace("SSH-2.0-", "").replace("SSH-1.5-", "")}
                {group.clientVersions.length > 1 && (
                  <span className="text-muted-foreground/60">+{group.clientVersions.length - 1}</span>
                )}
              </span>
            )}
          </div>

          {!expanded && hasCredentials && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {group.credentials.slice(0, CRED_PREVIEW).map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-foreground/80"
                >
                  <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                  {c.username}
                  <span className="text-muted-foreground/50">·</span>
                  <Key className="h-3 w-3 shrink-0 text-muted-foreground" />
                  {c.password}
                </span>
              ))}
              {group.credentials.length > CRED_PREVIEW && (
                <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  +{group.credentials.length - CRED_PREVIEW} más
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-secondary/20 p-4 space-y-4">
          {hasCredentials && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Credenciales probadas ({group.credentials.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.credentials.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md bg-card border border-border px-2 py-1 font-mono text-xs text-foreground"
                  >
                    <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                    {c.username}
                    <span className="text-muted-foreground/50 mx-0.5">:</span>
                    <Key className="h-3 w-3 shrink-0 text-muted-foreground" />
                    {c.password}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Intentos individuales ({group.sessions.length})
            </p>
            <div className="space-y-1">
              {group.sessions
                .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                .map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg bg-card border border-border px-3 py-2 text-xs"
                  >
                    <span className="text-muted-foreground w-32 shrink-0">
                      {formatDistanceToNow(new Date(s.startTime), { addSuffix: true })}
                    </span>
                    {s.duration !== null && (
                      <span className="text-muted-foreground w-12 shrink-0">{formatDuration(s.duration)}</span>
                    )}
                    {s.username ? (
                      <span className="flex items-center gap-1 font-mono text-foreground/80">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {s.username}
                        {s.password && (
                          <>
                            <span className="text-muted-foreground/50 mx-0.5">:</span>
                            <Key className="h-3 w-3 text-muted-foreground" />
                            {s.password}
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">sin credenciales</span>
                    )}
                    {s.clientVersion && (
                      <span className="hidden xl:block ml-auto text-muted-foreground/60 truncate max-w-[200px]">
                        {s.clientVersion.replace("SSH-2.0-", "").replace("SSH-1.5-", "")}
                      </span>
                    )}
                    <Link
                      href={`/sessions/${s.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Replay
                    </Link>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
