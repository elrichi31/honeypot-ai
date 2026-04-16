"use client"

import { useTimezone } from "@/components/timezone-provider"
import { formatTimeOnly } from "@/lib/timezone"
import {
  Plug,
  LogIn,
  LogOut,
  Terminal,
  Key,
  Monitor,
  Shield,
  ShieldX,
  Fingerprint,
} from "lucide-react"
import type { HoneypotEvent } from "@/lib/types"
import { cn } from "@/lib/utils"

const eventConfig: Record<
  string,
  { icon: typeof Plug; color: string; bgColor: string; label: string }
> = {
  "session.connect": {
    icon: Plug,
    color: "text-chart-1",
    bgColor: "bg-chart-1/20",
    label: "Connected",
  },
  "session.closed": {
    icon: LogOut,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    label: "Disconnected",
  },
  "client.version": {
    icon: Monitor,
    color: "text-chart-2",
    bgColor: "bg-chart-2/20",
    label: "Client Version",
  },
  "client.kex": {
    icon: Fingerprint,
    color: "text-chart-3",
    bgColor: "bg-chart-3/20",
    label: "Key Exchange",
  },
  "client.size": {
    icon: Monitor,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    label: "Terminal Size",
  },
  "auth.success": {
    icon: Shield,
    color: "text-success",
    bgColor: "bg-success/20",
    label: "Login Success",
  },
  "auth.failed": {
    icon: ShieldX,
    color: "text-destructive",
    bgColor: "bg-destructive/20",
    label: "Login Failed",
  },
  "command.input": {
    icon: Terminal,
    color: "text-warning",
    bgColor: "bg-warning/20",
    label: "Command",
  },
  unknown: {
    icon: Key,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    label: "Unknown",
  },
}

interface EventTimelineProps {
  events: HoneypotEvent[]
}

export function EventTimeline({ events }: EventTimelineProps) {
  const timezone = useTimezone()
  return (
    <div className="space-y-3">
      {events.map((event, index) => {
        const config = eventConfig[event.eventType] || eventConfig.unknown
        const Icon = config.icon

        return (
          <div key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  config.bgColor
                )}
              >
                <Icon className={cn("h-4 w-4", config.color)} />
              </div>
              {index < events.length - 1 && (
                <div className="mt-2 h-full w-px bg-border" />
              )}
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-center justify-between">
                <span className={cn("text-sm font-medium", config.color)}>
                  {config.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTimeOnly(event.eventTs, timezone)}
                </span>
              </div>
              {event.message && (
                <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                  {event.message}
                </p>
              )}
              {event.command && (
                <code className="mt-1 block rounded bg-background px-2 py-1 font-mono text-xs text-foreground">
                  $ {event.command}
                </code>
              )}
              {event.username && event.password && (
                <div className="mt-1 flex gap-2 text-xs">
                  <span className="text-muted-foreground">
                    User: <span className="text-foreground">{event.username}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Pass: <span className="text-foreground">{event.password}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
