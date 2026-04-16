"use client"

import { Terminal, User, Key } from "lucide-react"
import type { DashboardStats } from "@/lib/types"

interface TopListsProps {
  stats: DashboardStats
}

export function TopLists({ stats }: TopListsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Top Commands */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <Terminal className="h-4 w-4 text-warning" />
          <h3 className="font-semibold text-foreground">Top Commands</h3>
        </div>
        <div className="divide-y divide-border">
          {stats.topCommands.length > 0 ? (
            stats.topCommands.slice(0, 5).map((item, index) => (
              <div
                key={item.command}
                className="flex items-center justify-between gap-2 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                  <code className="truncate font-mono text-sm text-foreground" title={item.command}>
                    {item.command}
                  </code>
                </div>
                <span className="shrink-0 rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning">
                  {item.count}
                </span>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No commands recorded yet
            </div>
          )}
        </div>
      </div>

      {/* Top Usernames */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <User className="h-4 w-4 text-chart-1" />
          <h3 className="font-semibold text-foreground">Top Usernames</h3>
        </div>
        <div className="divide-y divide-border">
          {stats.topUsernames.length > 0 ? (
            stats.topUsernames.slice(0, 5).map((item, index) => (
              <div
                key={item.username}
                className="flex items-center justify-between gap-2 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="truncate font-mono text-sm text-foreground" title={item.username}>
                    {item.username}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-chart-1/20 px-2 py-0.5 text-xs text-chart-1">
                  {item.count}
                </span>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No usernames recorded yet
            </div>
          )}
        </div>
      </div>

      {/* Top Passwords */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <Key className="h-4 w-4 text-destructive" />
          <h3 className="font-semibold text-foreground">Top Passwords</h3>
        </div>
        <div className="divide-y divide-border">
          {stats.topPasswords.length > 0 ? (
            stats.topPasswords.slice(0, 5).map((item, index) => (
              <div
                key={item.password}
                className="flex items-center justify-between gap-2 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="truncate font-mono text-sm text-foreground" title={item.password}>
                    {item.password}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
                  {item.count}
                </span>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No passwords recorded yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
