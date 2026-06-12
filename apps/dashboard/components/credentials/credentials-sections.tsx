"use client"

import { formatDistanceToNow } from "date-fns"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import { ArrowDown, ArrowUp, ArrowUpDown, Clock, Globe, Shield, ShieldX } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Surface } from "@/components/ui/surface"
import { displayValue } from "@/lib/credentials"
import { useT } from "@/components/locale-provider"
import type {
  CredentialPairStat,
  CredentialAttempt,
  DiversifiedAttackerStat,
  PasswordCredentialStat,
  SprayPasswordStat,
  TargetedUsernameStat,
  UsernameCredentialStat,
} from "@/lib/api"

// Per-protocol tonal badge so each credential attempt shows which honeypot it
// came from (SSH, MySQL, MSSQL, VNC, RDP, FTP, ...).
const PROTOCOL_BADGE: Record<string, string> = {
  ssh:     "bg-cyan-400/15 text-cyan-400",
  mysql:   "bg-purple-400/15 text-purple-400",
  mssql:   "bg-pink-400/15 text-pink-400",
  ftp:     "bg-yellow-400/15 text-yellow-400",
  vnc:     "bg-emerald-400/15 text-emerald-400",
  rdp:     "bg-blue-400/15 text-blue-400",
  smb:     "bg-orange-400/15 text-orange-400",
  redis:   "bg-red-400/15 text-red-400",
}

function ProtocolBadge({ protocol }: { protocol: string }) {
  const style = PROTOCOL_BADGE[protocol] ?? "bg-slate-400/15 text-slate-400"
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium uppercase", style)}>
      {protocol}
    </span>
  )
}

function SortableHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string
  column: string
  sortBy: string
  sortDir: "asc" | "desc"
  onSort: (column: string) => void
}) {
  const active = sortBy === column
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown

  return (
    <TableHead>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSort(column)}
        className={cn(
          "-ml-3 h-8 px-3 text-xs uppercase text-muted-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </Button>
    </TableHead>
  )
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="px-4 py-8 text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  )
}

export function PairsTable({
  rows,
  sortBy,
  sortDir,
  onSort,
}: {
  rows: CredentialPairStat[]
  sortBy: string
  sortDir: "asc" | "desc"
  onSort: (column: string) => void
}) {
  const t = useT()
  const tz = useTimezone()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHeader label={t("cred.col.credentialPair")} column="credentialPair" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.attempts")} column="attempts" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.success")} column="successCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.failed")} column="failedCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.uniqueIps")} column="uniqueIps" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.lastSeen")} column="lastSeen" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length > 0 ? (
          rows.map((item) => (
            <TableRow key={`${item.username}:${item.password}:${item.lastSeen}`}>
              <TableCell className="px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm text-foreground">
                    {displayValue(item.username)}:{displayValue(item.password)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("cred.firstSeen")}{" "}
                    {item.firstSeen
                      ? formatDistanceToNow(new Date(item.firstSeen), { addSuffix: true })
                      : t("cred.unknown")}
                  </p>
                </div>
              </TableCell>
              <TableCell className="px-4 py-3">{item.attempts}</TableCell>
              <TableCell className="px-4 py-3 text-success">{item.successCount}</TableCell>
              <TableCell className="px-4 py-3 text-destructive">{item.failedCount}</TableCell>
              <TableCell className="px-4 py-3">{item.uniqueIps}</TableCell>
              <TableCell className="px-4 py-3">
                {item.lastSeen ? formatInTimezone(item.lastSeen, tz, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "-"}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={6} text={t("cred.empty.pairs")} />
        )}
      </TableBody>
    </Table>
  )
}

export function PasswordsTable({
  rows,
  sortBy,
  sortDir,
  onSort,
}: {
  rows: PasswordCredentialStat[]
  sortBy: string
  sortDir: "asc" | "desc"
  onSort: (column: string) => void
}) {
  const t = useT()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHeader label={t("cred.col.password")} column="password" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.attempts")} column="attempts" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.success")} column="successCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.failed")} column="failedCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.usernames")} column="usernameCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.uniqueIps")} column="uniqueIps" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length > 0 ? (
          rows.map((item) => (
            <TableRow key={`${item.password}-${item.attempts}`}>
              <TableCell className="px-4 py-3 font-mono text-sm">{displayValue(item.password)}</TableCell>
              <TableCell className="px-4 py-3">{item.attempts}</TableCell>
              <TableCell className="px-4 py-3 text-success">{item.successCount}</TableCell>
              <TableCell className="px-4 py-3 text-destructive">{item.failedCount}</TableCell>
              <TableCell className="px-4 py-3">{item.usernameCount}</TableCell>
              <TableCell className="px-4 py-3">{item.uniqueIps}</TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={6} text={t("cred.empty.passwords")} />
        )}
      </TableBody>
    </Table>
  )
}

export function UsernamesTable({
  rows,
  sortBy,
  sortDir,
  onSort,
}: {
  rows: UsernameCredentialStat[]
  sortBy: string
  sortDir: "asc" | "desc"
  onSort: (column: string) => void
}) {
  const t = useT()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHeader label={t("cred.col.username")} column="username" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.attempts")} column="attempts" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.success")} column="successCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.failed")} column="failedCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.passwords")} column="passwordCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.uniqueIps")} column="uniqueIps" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length > 0 ? (
          rows.map((item) => (
            <TableRow key={`${item.username}-${item.attempts}`}>
              <TableCell className="px-4 py-3 font-mono text-sm">{displayValue(item.username)}</TableCell>
              <TableCell className="px-4 py-3">{item.attempts}</TableCell>
              <TableCell className="px-4 py-3 text-success">{item.successCount}</TableCell>
              <TableCell className="px-4 py-3 text-destructive">{item.failedCount}</TableCell>
              <TableCell className="px-4 py-3">{item.passwordCount}</TableCell>
              <TableCell className="px-4 py-3">{item.uniqueIps}</TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={6} text={t("cred.empty.usernames")} />
        )}
      </TableBody>
    </Table>
  )
}

export function PatternCard<T>({
  title,
  subtitle,
  rows,
  emptyText,
  renderRow,
}: {
  title: string
  subtitle: string
  rows: T[]
  emptyText: string
  renderRow: (row: T) => React.ReactNode
}) {
  return (
    <Surface>
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="divide-y divide-border">
        {rows.length > 0 ? rows.slice(0, 10).map(renderRow) : <div className="p-4 text-sm text-muted-foreground">{emptyText}</div>}
      </div>
    </Surface>
  )
}

export function PatternRow({
  label,
  meta,
  value,
  tone,
}: {
  label: string
  meta: string
  value: string
  tone: "default" | "warning" | "destructive"
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate font-mono text-sm text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs",
          tone === "warning" && "bg-warning/15 text-warning",
          tone === "destructive" && "bg-destructive/15 text-destructive",
          tone === "default" && "bg-secondary text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function RecentAttemptsTable({
  rows,
  sortBy,
  sortDir,
  onSort,
}: {
  rows: CredentialAttempt[]
  sortBy: string
  sortDir: "asc" | "desc"
  onSort: (column: string) => void
}) {
  const t = useT()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHeader label={t("cred.col.status")} column="status" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <TableHead>{t("cred.col.protocol")}</TableHead>
          <SortableHeader label={t("cred.col.username")} column="username" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.password")} column="password" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.sourceIp")} column="srcIp" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label={t("cred.col.when")} column="eventTs" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length > 0 ? (
          rows.map((event, i) => (
            <TableRow key={`${event.srcIp}-${event.eventTs}-${i}`}>
              <TableCell className="px-4 py-3">
                {event.success ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-1 text-xs text-success">
                    <Shield className="h-3 w-3" />
                    {t("cred.status.success")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-1 text-xs text-destructive">
                    <ShieldX className="h-3 w-3" />
                    {t("cred.status.failed")}
                  </span>
                )}
              </TableCell>
              <TableCell className="px-4 py-3">
                <ProtocolBadge protocol={event.protocol} />
              </TableCell>
              <TableCell className="px-4 py-3 font-mono text-sm">{displayValue(event.username)}</TableCell>
              <TableCell className="px-4 py-3 font-mono text-sm">{displayValue(event.password)}</TableCell>
              <TableCell className="px-4 py-3">
                <span className="flex items-center gap-1 font-mono text-sm text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  {event.srcIp}
                </span>
              </TableCell>
              <TableCell className="px-4 py-3">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(event.eventTs), { addSuffix: true })}
                </span>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={6} text={t("cred.empty.recent")} />
        )}
      </TableBody>
    </Table>
  )
}

export type { SprayPasswordStat, TargetedUsernameStat, DiversifiedAttackerStat }
