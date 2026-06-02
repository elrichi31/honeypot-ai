"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowUp, ArrowDown, ArrowUpDown, Network, Search, X } from "lucide-react"
import { TableShell } from "@/components/table-shell"
import { EmptyState } from "@/components/ui/data-states"
import { NavTransitionProvider, useNavTransition } from "@/lib/use-nav-transition"
import { cn } from "@/lib/utils"
import type { PaginationMeta, RiskLevel, ThreatSummary } from "@/lib/api"
import { LEVEL_STYLES, CMD_COLORS, CMD_LABELS, CMD_LABELS_SHORT } from "@/lib/attack-types"

const RISK_LEVELS: RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]

const COMMAND_CATEGORIES = [
  "malware_drop", "persistence", "lateral_movement", "crypto_mining", "data_exfil", "recon", "other",
] as const

const PROTOCOL_LABELS: Record<string, string> = {
  ssh: "SSH",
  http: "HTTP",
  ftp: "FTP",
  mysql: "MYSQL",
  "port-scan": "PORT-SCAN",
  dionaea: "DIONAEA",
  smb: "SMB",
  mssql: "MSSQL",
  rpc: "RPC",
  tftp: "TFTP",
  mqtt: "MQTT",
}

const PROTOCOL_STYLES: Record<string, string> = {
  ssh: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400",
  http: "border-blue-500/20 bg-blue-500/10 text-blue-400",
  ftp: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  mysql: "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-400",
  "port-scan": "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  dionaea: "border-red-500/20 bg-red-500/10 text-red-400",
  smb: "border-orange-500/20 bg-orange-500/10 text-orange-400",
  mssql: "border-pink-500/20 bg-pink-500/10 text-pink-400",
  rpc: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
  tftp: "border-lime-500/20 bg-lime-500/10 text-lime-400",
  mqtt: "border-teal-500/20 bg-teal-500/10 text-teal-400",
}

function SortableTh({ label, column, sortBy, sortDir, searchParams, push }: {
  label: string; column: string; sortBy: string; sortDir: string
  searchParams: URLSearchParams; push: (href: string) => void
}) {
  const isActive = sortBy === column
  const nextDir = isActive && sortDir === "desc" ? "asc" : "desc"
  const params = new URLSearchParams(searchParams.toString())
  params.set("sortBy", column)
  params.set("sortDir", nextDir)
  params.delete("page")
  return (
    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
      <button
        type="button"
        onClick={() => push(`/threats?${params}`)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {isActive ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )
}

interface ThreatsTableProps {
  threats: ThreatSummary[]
  pagination?: PaginationMeta
  sortBy?: string
  sortDir?: string
  searchQuery?: string
  levels?: RiskLevel[]
  commands?: string[]
  crossProtocol?: boolean
}

export function ThreatsTable(props: ThreatsTableProps) {
  return (
    <NavTransitionProvider>
      <ThreatsTableInner {...props} />
    </NavTransitionProvider>
  )
}

function ThreatsTableInner({
  threats,
  pagination,
  sortBy = "score",
  sortDir = "desc",
  searchQuery = "",
  levels = [],
  commands = [],
  crossProtocol = false,
}: ThreatsTableProps) {
  const searchParams = useSearchParams()
  const { push, pushParams } = useNavTransition()

  const [search, setSearch] = useState(searchQuery)
  useEffect(() => { setSearch(searchQuery) }, [searchQuery])

  /** Toggle one value inside a CSV multi-select param; resets to page 1. */
  function toggleCsv(key: "levels" | "commands", current: string[], value: string) {
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    if (next.length === 0) {
      pushParams({ page: "1" }, [key])
    } else {
      pushParams({ [key]: next.join(","), page: "1" })
    }
  }

  function toggleCrossProtocol() {
    if (crossProtocol) {
      pushParams({ page: "1" }, ["crossProtocol"])
    } else {
      pushParams({ crossProtocol: "true", page: "1" })
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = search.trim()
    if (trimmed) {
      pushParams({ q: trimmed, page: "1" })
    } else {
      pushParams({ page: "1" }, ["q"])
    }
  }

  function clearAll() {
    setSearch("")
    pushParams({ page: "1" }, ["q", "levels", "commands", "crossProtocol"])
  }

  const levelSet = new Set(levels)
  const commandSet = new Set(commands)
  const hasActiveFilters =
    Boolean(searchQuery) || levels.length > 0 || commands.length > 0 || crossProtocol

  const toolbar = (
    <div className="space-y-3">
      <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search IP across all attackers…"
            className="h-10 w-full rounded-lg border border-border bg-secondary pl-10 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search input"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Search
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </button>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Level</span>
          {RISK_LEVELS.map((lvl) => {
            const isActive = levelSet.has(lvl)
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => toggleCsv("levels", levels, lvl)}
                aria-pressed={isActive}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  isActive
                    ? LEVEL_STYLES[lvl].badge
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/30",
                )}
              >
                {lvl}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Commands</span>
          {COMMAND_CATEGORIES.map((category) => {
            const isActive = commandSet.has(category)
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCsv("commands", commands, category)}
                aria-pressed={isActive}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  isActive
                    ? CMD_COLORS[category]
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/30",
                )}
              >
                {CMD_LABELS[category] ?? category}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={toggleCrossProtocol}
          aria-pressed={crossProtocol}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors",
            crossProtocol
              ? "border-purple-500/40 bg-purple-500/15 text-purple-400"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/30",
          )}
        >
          <Network className="h-3 w-3" />
          Cross-protocol
        </button>
      </div>
    </div>
  )

  return (
    <TableShell
      title="Threat ranking"
      description="Sorted by risk score · click to view detail"
      toolbar={toolbar}
      pagination={pagination}
    >
      {threats.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon="shield"
            title="No threats match these filters"
            description="Try a different IP, risk level, or command category — or clear the active filters to see all attackers."
          />
        ) : (
          <EmptyState
            icon="shield"
            title="No threats detected"
            description="Threat intelligence will appear here once attackers are detected across SSH, HTTP or network protocols."
          />
        )
      ) : (
        <table className="min-w-[1340px] w-full text-sm">
          <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">#</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">IP</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Level</th>
                <SortableTh label="Score" column="score" sortBy={sortBy} sortDir={sortDir} searchParams={searchParams} push={push} />
                <SortableTh label="Sessions" column="sessions" sortBy={sortBy} sortDir={sortDir} searchParams={searchParams} push={push} />
                <SortableTh label="Web hits" column="webHits" sortBy={sortBy} sortDir={sortDir} searchParams={searchParams} push={push} />
                <SortableTh label="Protocols" column="protocols" sortBy={sortBy} sortDir={sortDir} searchParams={searchParams} push={push} />
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Detected commands</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Top factors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {threats.map((threat, index) => {
                const style = LEVEL_STYLES[threat.level]
                const activeCommands = Object.entries(threat.commandCategories).filter(([, value]) => value > 0)
                const protocolBadges = threat.protocolsSeen.map((protocol) => {
                  const label = PROTOCOL_LABELS[protocol] ?? protocol.toUpperCase()
                  const badgeStyle = PROTOCOL_STYLES[protocol] ?? "border-border bg-muted/10 text-muted-foreground"
                  const protocolStats = threat.protocols?.byService?.[protocol]
                  const value =
                    protocol === "ssh" ? `${threat.ssh?.sessions ?? 0}s`
                    : protocol === "http" ? `${threat.web?.hits ?? 0}h`
                    : `${protocolStats?.hits ?? 0}e`

                  return { protocol, label, badgeStyle, value }
                })

                return (
                  <tr
                    key={threat.ip}
                    onClick={() => push(`/threats/${encodeURIComponent(threat.ip)}`)}
                    className="cursor-pointer transition-colors hover:bg-muted/10"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{index + 1}</td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                        <span className="font-mono text-sm font-medium text-foreground">{threat.ip}</span>
                        {threat.crossProtocol && (
                          <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                            MULTI {threat.protocolsSeen.length}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${style.badge}`}>
                        {threat.level}
                      </span>
                    </td>

                    <td className="w-36 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted">
                          <div className={`h-1.5 rounded-full ${style.bar}`} style={{ width: `${threat.score}%` }} />
                        </div>
                        <span className="w-8 text-right font-mono text-xs font-semibold text-foreground">{threat.score}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {threat.ssh?.sessions ?? 0}
                    </td>

                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {threat.web?.hits ?? 0}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {protocolBadges.map(({ protocol, label, badgeStyle, value }) => (
                          <span
                            key={protocol}
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${badgeStyle}`}
                          >
                            {label} {value}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {activeCommands.length === 0 ? (
                          <span className="text-xs text-muted-foreground/50">-</span>
                        ) : (
                          activeCommands.map(([category, count]) => (
                            <span
                              key={category}
                              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${CMD_COLORS[category] ?? CMD_COLORS.recon}`}
                            >
                              {CMD_LABELS_SHORT[category] ?? category} x{count}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    <td className="max-w-xs px-4 py-3">
                      <ul className="space-y-0.5">
                        {threat.topFactors.map((factor, factorIndex) => (
                          <li key={factorIndex} className="truncate text-xs text-muted-foreground">
                            {factor}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
      )}
    </TableShell>
  )
}
