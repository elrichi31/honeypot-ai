"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowUp, ArrowDown, ArrowUpDown, Network, Search, X } from "lucide-react"
import { TableShell } from "@/components/table-shell"
import { EmptyState } from "@/components/ui/data-states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox"
import { OverflowBadges, type BadgeItem } from "@/components/ui/overflow-badges"
import { NavTransitionProvider, useNavTransition } from "@/lib/use-nav-transition"
import { useT } from "@/components/locale-provider"
import { cn } from "@/lib/utils"
import type { PaginationMeta, RiskLevel, ThreatSummary } from "@/lib/api"
import { LEVEL_STYLES, CMD_COLORS, CMD_LABELS, CMD_LABELS_SHORT } from "@/lib/attack-types"
import { Flag } from "@/components/ui/flag"

const RISK_LEVELS: RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]

const COMMAND_CATEGORIES = [
  "malware_drop", "persistence", "lateral_movement", "crypto_mining", "data_exfil", "recon", "other",
] as const

const LEVEL_OPTIONS: MultiSelectOption[] = RISK_LEVELS.map((lvl) => ({
  value: lvl,
  label: lvl,
  dotClassName: LEVEL_STYLES[lvl].dot,
}))

const COMMAND_OPTIONS: MultiSelectOption[] = COMMAND_CATEGORIES.map((category) => ({
  value: category,
  label: CMD_LABELS[category] ?? category,
}))

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

function SortableHead({ label, column, sortBy, sortDir, searchParams, push, className }: {
  label: string; column: string; sortBy: string; sortDir: string
  searchParams: URLSearchParams; push: (href: string) => void; className?: string
}) {
  const isActive = sortBy === column
  const nextDir = isActive && sortDir === "desc" ? "asc" : "desc"
  const params = new URLSearchParams(searchParams.toString())
  params.set("sortBy", column)
  params.set("sortDir", nextDir)
  params.delete("page")
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => push(`/threats?${params}`)}
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
      >
        {label}
        {isActive ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </TableHead>
  )
}

interface ThreatsTableProps {
  threats: ThreatSummary[]
  geo?: Record<string, { country: string; countryName: string } | null>
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
  geo = {},
  pagination,
  sortBy = "score",
  sortDir = "desc",
  searchQuery = "",
  levels = [],
  commands = [],
  crossProtocol = false,
}: ThreatsTableProps) {
  const t = useT()
  const searchParams = useSearchParams()
  const { push, pushParams } = useNavTransition()

  const [search, setSearch] = useState(searchQuery)
  useEffect(() => { setSearch(searchQuery) }, [searchQuery])

  /** Replace a CSV multi-select param with `next`; resets to page 1. */
  function setCsv(key: "levels" | "commands", next: string[]) {
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

  const hasActiveFilters =
    Boolean(searchQuery) || levels.length > 0 || commands.length > 0 || crossProtocol

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <form onSubmit={submitSearch} className="flex min-w-[260px] flex-1 items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("threats.table.searchPlaceholder")}
            className="h-9 w-full rounded-lg border border-border bg-secondary pl-10 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={t("threats.table.clearSearch")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="h-9 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          {t("threats.table.search")}
        </button>
      </form>

      <MultiSelectCombobox
        label={t("threats.table.level")}
        options={LEVEL_OPTIONS}
        selected={levels}
        onChange={(next) => setCsv("levels", next)}
      />

      <MultiSelectCombobox
        label={t("threats.table.commands")}
        options={COMMAND_OPTIONS}
        selected={commands}
        onChange={(next) => setCsv("commands", next)}
        searchable
        searchPlaceholder={t("threats.table.filterCategories")}
      />

      <button
        type="button"
        onClick={toggleCrossProtocol}
        aria-pressed={crossProtocol}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors",
          crossProtocol
            ? "border-purple-500/40 bg-purple-500/15 text-purple-400"
            : "border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground",
        )}
      >
        <Network className="h-3.5 w-3.5" />
        {t("threats.stat.crossProtocol")}
      </button>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          {t("threats.table.clearAll")}
        </button>
      )}
    </div>
  )

  return (
    <TableShell
      title={t("threats.table.title")}
      description={t("threats.table.description")}
      toolbar={toolbar}
      pagination={pagination}
    >
      {threats.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon="shield"
            title={t("threats.table.empty.filtered.title")}
            description={t("threats.table.empty.filtered.description")}
          />
        ) : (
          <EmptyState
            icon="shield"
            title={t("threats.table.empty.title")}
            description={t("threats.table.empty.description")}
          />
        )
      ) : (
        <Table className="w-full min-w-[760px]">
          <TableHeader>
            <TableRow className="bg-muted/20">
              <TableHead>#</TableHead>
              <TableHead>{t("threats.table.col.ip")}</TableHead>
              <TableHead>{t("threats.table.col.level")}</TableHead>
              <SortableHead label={t("threats.table.col.score")} column="score" sortBy={sortBy} sortDir={sortDir} searchParams={searchParams} push={push} />
              <SortableHead label={t("threats.table.col.sessions")} column="sessions" sortBy={sortBy} sortDir={sortDir} searchParams={searchParams} push={push} />
              <SortableHead label={t("threats.table.col.webHits")} column="webHits" sortBy={sortBy} sortDir={sortDir} searchParams={searchParams} push={push} className="hidden lg:table-cell" />
              <SortableHead label={t("threats.table.col.protocols")} column="protocols" sortBy={sortBy} sortDir={sortDir} searchParams={searchParams} push={push} />
              <TableHead>{t("threats.table.col.detectedCommands")}</TableHead>
              <TableHead className="hidden xl:table-cell">{t("threats.table.col.topFactors")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {threats.map((threat, index) => {
              const style = LEVEL_STYLES[threat.level]
              const activeCommands = Object.entries(threat.commandCategories).filter(([, value]) => value > 0)
              const protocolBadges: BadgeItem[] = threat.protocolsSeen.map((protocol) => {
                const label = PROTOCOL_LABELS[protocol] ?? protocol.toUpperCase()
                const badgeStyle = PROTOCOL_STYLES[protocol] ?? "border-border bg-muted/10 text-muted-foreground"
                const protocolStats = threat.protocols?.byService?.[protocol]
                const value =
                  protocol === "ssh" ? `${threat.ssh?.sessions ?? 0}s`
                  : protocol === "http" ? `${threat.web?.hits ?? 0}h`
                  : `${protocolStats?.hits ?? 0}e`

                return { key: protocol, label: `${label} ${value}`, className: badgeStyle }
              })

              const commandBadges: BadgeItem[] = activeCommands.map(([category, count]) => ({
                key: category,
                label: `${CMD_LABELS_SHORT[category] ?? category} x${count}`,
                className: CMD_COLORS[category] ?? CMD_COLORS.recon,
              }))

              const location = geo[threat.ip] ?? null
              return (
                <TableRow
                  key={threat.ip}
                  onClick={() => push(`/threats/${encodeURIComponent(threat.ip)}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">{index + 1}</TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                      {location?.country && <Flag code={location.country} />}
                      <div>
                        <span className="font-mono text-sm font-medium text-foreground">{threat.ip}</span>
                        {location?.countryName && (
                          <p className="text-xs text-muted-foreground">{location.countryName}</p>
                        )}
                      </div>
                      {threat.crossProtocol && (
                        <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                          MULTI {threat.protocolsSeen.length}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${style.badge}`}>
                      {threat.level}
                    </span>
                  </TableCell>

                  <TableCell className="w-36">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted">
                        <div className={`h-1.5 rounded-full ${style.bar}`} style={{ width: `${threat.score}%` }} />
                      </div>
                      <span className="w-8 text-right font-mono text-xs font-semibold text-foreground">{threat.score}</span>
                    </div>
                  </TableCell>

                  <TableCell className="font-mono text-xs text-foreground">
                    {threat.ssh?.sessions ?? 0}
                  </TableCell>

                  <TableCell className="hidden font-mono text-xs text-foreground lg:table-cell">
                    {threat.web?.hits ?? 0}
                  </TableCell>

                  <TableCell>
                    <OverflowBadges items={protocolBadges} max={3} />
                  </TableCell>

                  <TableCell>
                    <OverflowBadges items={commandBadges} max={3} />
                  </TableCell>

                  <TableCell className="hidden max-w-xs whitespace-normal xl:table-cell">
                    <ul className="space-y-0.5">
                      {threat.topFactors.map((factor, factorIndex) => (
                        <li key={factorIndex} className="truncate text-xs text-muted-foreground">
                          {factor}
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </TableShell>
  )
}
