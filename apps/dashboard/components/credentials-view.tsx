"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Search, Shield, ShieldX, User, Key, Clock, Globe } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { HoneypotEvent } from "@/lib/api"

interface CredentialsViewProps {
  events: HoneypotEvent[]
}

export function CredentialsView({ events }: CredentialsViewProps) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all")

  const filteredEvents = events.filter((event) => {
    const matchesSearch =
      event.username?.toLowerCase().includes(search.toLowerCase()) ||
      event.password?.toLowerCase().includes(search.toLowerCase()) ||
      event.srcIp.toLowerCase().includes(search.toLowerCase())

    const matchesFilter =
      filter === "all" ||
      (filter === "success" && event.success === true) ||
      (filter === "failed" && event.success === false)

    return matchesSearch && matchesFilter
  })

  const successCount = events.filter((e) => e.success === true).length
  const failedCount = events.filter((e) => e.success === false).length
  const uniqueUsernames = new Set(events.map((e) => e.username).filter(Boolean))
  const uniquePasswords = new Set(events.map((e) => e.password).filter(Boolean))

  return (
    <>
      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-success" />
            Successful
          </div>
          <p className="mt-2 text-3xl font-bold text-success">{successCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldX className="h-4 w-4 text-destructive" />
            Failed
          </div>
          <p className="mt-2 text-3xl font-bold text-destructive">{failedCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4 text-chart-1" />
            Unique Users
          </div>
          <p className="mt-2 text-3xl font-bold text-chart-1">
            {uniqueUsernames.size}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Key className="h-4 w-4 text-chart-3" />
            Unique Passwords
          </div>
          <p className="mt-2 text-3xl font-bold text-chart-3">
            {uniquePasswords.size}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by username, password, or IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "success", "failed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                filter === f
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Credentials Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                  Username
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                  Password
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                  Source IP
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredEvents.length > 0 ? (
                filteredEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-secondary/50">
                    <td className="px-4 py-3">
                      {event.success ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-1 text-xs text-success">
                          <Shield className="h-3 w-3" />
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-1 text-xs text-destructive">
                          <ShieldX className="h-3 w-3" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-foreground">
                        {event.username || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-foreground">
                        {event.password || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 font-mono text-sm text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        {event.srcIp}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(event.eventTs), {
                          addSuffix: true,
                        })}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No credentials found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
