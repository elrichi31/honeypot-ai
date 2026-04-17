"use client"

import { format, formatDistanceToNow } from "date-fns"
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
import { displayValue } from "@/lib/credentials"
import type {
  CredentialPairStat,
  DiversifiedAttackerStat,
  HoneypotEvent,
  PasswordCredentialStat,
  SprayPasswordStat,
  TargetedUsernameStat,
  UsernameCredentialStat,
} from "@/lib/api"

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

function StaticHeader({ label }: { label: string }) {
  return <TableHead className="px-4 py-3 text-xs uppercase text-muted-foreground">{label}</TableHead>
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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHeader label="Credential Pair" column="credentialPair" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Attempts" column="attempts" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Success" column="successCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Failed" column="failedCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Unique IPs" column="uniqueIps" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Last Seen" column="lastSeen" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
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
                    First seen{" "}
                    {item.firstSeen
                      ? formatDistanceToNow(new Date(item.firstSeen), { addSuffix: true })
                      : "unknown"}
                  </p>
                </div>
              </TableCell>
              <TableCell className="px-4 py-3">{item.attempts}</TableCell>
              <TableCell className="px-4 py-3 text-success">{item.successCount}</TableCell>
              <TableCell className="px-4 py-3 text-destructive">{item.failedCount}</TableCell>
              <TableCell className="px-4 py-3">{item.uniqueIps}</TableCell>
              <TableCell className="px-4 py-3">
                {item.lastSeen ? format(new Date(item.lastSeen), "MMM d, HH:mm") : "-"}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={6} text="No credential pairs match the current filters." />
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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHeader label="Password" column="password" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Attempts" column="attempts" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Success" column="successCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Failed" column="failedCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Usernames" column="usernameCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Unique IPs" column="uniqueIps" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
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
          <EmptyRow colSpan={6} text="No passwords match the current filters." />
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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHeader label="Username" column="username" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Attempts" column="attempts" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Success" column="successCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Failed" column="failedCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Passwords" column="passwordCount" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Unique IPs" column="uniqueIps" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
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
          <EmptyRow colSpan={6} text="No usernames match the current filters." />
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
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="divide-y divide-border">
        {rows.length > 0 ? rows.slice(0, 10).map(renderRow) : <div className="p-4 text-sm text-muted-foreground">{emptyText}</div>}
      </div>
    </div>
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
  rows: HoneypotEvent[]
  sortBy: string
  sortDir: "asc" | "desc"
  onSort: (column: string) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHeader label="Status" column="status" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Username" column="username" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Password" column="password" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="Source IP" column="srcIp" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          <SortableHeader label="When" column="eventTs" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length > 0 ? (
          rows.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="px-4 py-3">
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
          <EmptyRow colSpan={5} text="No auth attempts match the current filters." />
        )}
      </TableBody>
    </Table>
  )
}

export type { SprayPasswordStat, TargetedUsernameStat, DiversifiedAttackerStat }
