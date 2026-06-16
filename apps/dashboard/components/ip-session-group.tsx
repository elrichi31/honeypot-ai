"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  ChevronDown, ChevronRight, Clock, Bot, User,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Flag } from "@/components/ui/flag"
import { ShieldX } from "lucide-react"
import { type IpGroup } from "@/lib/session-classify-v2"
import { SessionRow } from "./session-row"

export function IpSessionGroup({ group }: { group: IpGroup }) {
  const [expanded, setExpanded] = useState(false)
  const cls = group.worstClassification
  const Icon = cls.icon
  const isBot = group.sessionTypes.has("bot") && !group.sessionTypes.has("human")
  const isHuman = group.sessionTypes.has("human")
  const sessionCount = group.sessions.length

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
                <Flag code={group.country} />
                <span>{group.countryName}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
              <ShieldX className="h-3 w-3" /> Comprometido
            </span>
            {isBot && !isHuman && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-400">
                <Bot className="h-3 w-3" /> Bot
              </span>
            )}
            {isHuman && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">
                <User className="h-3 w-3" /> Human
              </span>
            )}
            <span className={cn("inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium", cls.bg, cls.color)}>
              <Icon className="h-3 w-3" />
              {cls.label}
            </span>
            {sessionCount > 1 && (
              <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {sessionCount} sesiones
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-muted-foreground">{cls.summary}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(group.lastSeen), { addSuffix: true })}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-secondary/20 divide-y divide-border">
          {group.sessions
            .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
            .map((session) => (
              <div key={session.id} className="pl-10">
                <SessionRow session={session} />
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
