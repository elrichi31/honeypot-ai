"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { Search, Terminal, Clock, Globe } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { HoneypotEvent, PaginationMeta } from "@/lib/api"
import { TablePagination } from "./table-pagination"

interface CommandsViewProps {
  events: HoneypotEvent[]
  searchQuery: string
  pagination: PaginationMeta
}

export function CommandsView({ events, searchQuery, pagination }: CommandsViewProps) {
  const pathname = usePathname()
  const [query, setQuery] = useState(searchQuery)

  useEffect(() => {
    setQuery(searchQuery)
  }, [searchQuery])

  const commands = events
    .filter((event) => event.command)
    .sort((a, b) => new Date(b.eventTs).getTime() - new Date(a.eventTs).getTime())

  const commandCounts = new Map<string, number>()
  commands.forEach((event) => {
    if (event.command) {
      const command = event.command.split(" ")[0]
      commandCounts.set(command, (commandCounts.get(command) || 0) + 1)
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
            <form action={pathname} className="flex flex-wrap gap-2">
              <input type="hidden" name="pageSize" value={String(pagination.pageSize)} />
              <div className="relative min-w-72 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="q"
                  placeholder="Buscar comando, IP o credencial..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-10"
                />
              </div>
              <button
                type="submit"
                className="h-10 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Buscar
              </button>
            </form>
          </div>

          <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
            {commands.length > 0 ? (
              commands.map((command) => (
                <div key={command.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/20">
                      <Terminal className="h-4 w-4 text-warning" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <code className="block rounded bg-background px-3 py-2 font-mono text-sm text-foreground">
                        $ {command.command}
                      </code>
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {command.srcIp}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(command.eventTs), { addSuffix: true })}
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

          <TablePagination pagination={pagination} />
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold text-foreground">Matching Commands</h3>
          <p className="mt-2 text-4xl font-bold text-warning">
            {pagination.total.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <h3 className="font-semibold text-foreground">
              Most Used On This Page
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
