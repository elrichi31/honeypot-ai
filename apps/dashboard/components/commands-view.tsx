"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Search, Terminal, Clock, Globe } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { HoneypotEvent } from "@/lib/api"

interface CommandsViewProps {
  events: HoneypotEvent[]
}

export function CommandsView({ events }: CommandsViewProps) {
  const [search, setSearch] = useState("")

  const commands = events
    .filter((e) => e.command)
    .sort((a, b) => new Date(b.eventTs).getTime() - new Date(a.eventTs).getTime())

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.command?.toLowerCase().includes(search.toLowerCase()) ||
      cmd.srcIp.toLowerCase().includes(search.toLowerCase())
  )

  const commandCounts = new Map<string, number>()
  commands.forEach((e) => {
    if (e.command) {
      const cmd = e.command.split(" ")[0]
      commandCounts.set(cmd, (commandCounts.get(cmd) || 0) + 1)
    }
  })

  const topCommands = Array.from(commandCounts.entries())
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search commands or IPs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
            {filteredCommands.length > 0 ? (
              filteredCommands.map((cmd) => (
                <div key={cmd.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/20">
                      <Terminal className="h-4 w-4 text-warning" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <code className="block rounded bg-background px-3 py-2 font-mono text-sm text-foreground">
                        $ {cmd.command}
                      </code>
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {cmd.srcIp}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(cmd.eventTs), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                No commands found
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold text-foreground">Total Commands</h3>
          <p className="mt-2 text-4xl font-bold text-warning">
            {commands.length}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <h3 className="font-semibold text-foreground">
              Most Used Commands
            </h3>
          </div>
          <div className="divide-y divide-border">
            {topCommands.map((item, index) => (
              <div
                key={item.command}
                className="flex items-center justify-between p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                  <code className="font-mono text-sm text-foreground">
                    {item.command}
                  </code>
                </div>
                <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
