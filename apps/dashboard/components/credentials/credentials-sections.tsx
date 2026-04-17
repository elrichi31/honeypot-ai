"use client"

import { format, formatDistanceToNow } from "date-fns"
import { Clock, Globe, Shield, ShieldX } from "lucide-react"
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

function HeaderCell({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
      {children}
    </th>
  )
}

function BodyCell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <td className={cn("px-4 py-3 text-sm text-foreground", className)}>{children}</td>
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-muted-foreground">
        {text}
      </td>
    </tr>
  )
}

export function PairsTable({ rows }: { rows: CredentialPairStat[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border">
          <HeaderCell>Credential Pair</HeaderCell>
          <HeaderCell>Attempts</HeaderCell>
          <HeaderCell>Success</HeaderCell>
          <HeaderCell>Failed</HeaderCell>
          <HeaderCell>Unique IPs</HeaderCell>
          <HeaderCell>Last Seen</HeaderCell>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.length > 0 ? (
          rows.map((item) => (
            <tr key={`${item.username}:${item.password}:${item.lastSeen}`} className="hover:bg-secondary/40">
              <BodyCell>
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
              </BodyCell>
              <BodyCell>{item.attempts}</BodyCell>
              <BodyCell className="text-success">{item.successCount}</BodyCell>
              <BodyCell className="text-destructive">{item.failedCount}</BodyCell>
              <BodyCell>{item.uniqueIps}</BodyCell>
              <BodyCell>{item.lastSeen ? format(new Date(item.lastSeen), "MMM d, HH:mm") : "-"}</BodyCell>
            </tr>
          ))
        ) : (
          <EmptyRow colSpan={6} text="No credential pairs match the current filters." />
        )}
      </tbody>
    </table>
  )
}

export function PasswordsTable({ rows }: { rows: PasswordCredentialStat[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border">
          <HeaderCell>Password</HeaderCell>
          <HeaderCell>Attempts</HeaderCell>
          <HeaderCell>Success</HeaderCell>
          <HeaderCell>Failed</HeaderCell>
          <HeaderCell>Usernames</HeaderCell>
          <HeaderCell>Unique IPs</HeaderCell>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.length > 0 ? (
          rows.map((item) => (
            <tr key={`${item.password}-${item.attempts}`} className="hover:bg-secondary/40">
              <BodyCell>
                <span className="font-mono text-sm text-foreground">{displayValue(item.password)}</span>
              </BodyCell>
              <BodyCell>{item.attempts}</BodyCell>
              <BodyCell className="text-success">{item.successCount}</BodyCell>
              <BodyCell className="text-destructive">{item.failedCount}</BodyCell>
              <BodyCell>{item.usernameCount}</BodyCell>
              <BodyCell>{item.uniqueIps}</BodyCell>
            </tr>
          ))
        ) : (
          <EmptyRow colSpan={6} text="No passwords match the current filters." />
        )}
      </tbody>
    </table>
  )
}

export function UsernamesTable({ rows }: { rows: UsernameCredentialStat[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border">
          <HeaderCell>Username</HeaderCell>
          <HeaderCell>Attempts</HeaderCell>
          <HeaderCell>Success</HeaderCell>
          <HeaderCell>Failed</HeaderCell>
          <HeaderCell>Passwords</HeaderCell>
          <HeaderCell>Unique IPs</HeaderCell>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.length > 0 ? (
          rows.map((item) => (
            <tr key={`${item.username}-${item.attempts}`} className="hover:bg-secondary/40">
              <BodyCell>
                <span className="font-mono text-sm text-foreground">{displayValue(item.username)}</span>
              </BodyCell>
              <BodyCell>{item.attempts}</BodyCell>
              <BodyCell className="text-success">{item.successCount}</BodyCell>
              <BodyCell className="text-destructive">{item.failedCount}</BodyCell>
              <BodyCell>{item.passwordCount}</BodyCell>
              <BodyCell>{item.uniqueIps}</BodyCell>
            </tr>
          ))
        ) : (
          <EmptyRow colSpan={6} text="No usernames match the current filters." />
        )}
      </tbody>
    </table>
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

export function RecentAttemptsTable({ rows }: { rows: HoneypotEvent[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border">
          <HeaderCell>Status</HeaderCell>
          <HeaderCell>Username</HeaderCell>
          <HeaderCell>Password</HeaderCell>
          <HeaderCell>Source IP</HeaderCell>
          <HeaderCell>When</HeaderCell>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.length > 0 ? (
          rows.map((event) => (
            <tr key={event.id} className="hover:bg-secondary/40">
              <BodyCell>
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
              </BodyCell>
              <BodyCell>
                <span className="font-mono text-sm text-foreground">{displayValue(event.username)}</span>
              </BodyCell>
              <BodyCell>
                <span className="font-mono text-sm text-foreground">{displayValue(event.password)}</span>
              </BodyCell>
              <BodyCell>
                <span className="flex items-center gap-1 font-mono text-sm text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  {event.srcIp}
                </span>
              </BodyCell>
              <BodyCell>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(event.eventTs), { addSuffix: true })}
                </span>
              </BodyCell>
            </tr>
          ))
        ) : (
          <EmptyRow colSpan={5} text="No auth attempts match the current filters." />
        )}
      </tbody>
    </table>
  )
}

export type { SprayPasswordStat, TargetedUsernameStat, DiversifiedAttackerStat }
