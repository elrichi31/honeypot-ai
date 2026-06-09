"use client"

import Link from "next/link"
import { Fingerprint } from "lucide-react"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import type { DashboardInsights } from "@/lib/api"

function formatDateLabel(value: string | null, tz: string) {
  if (!value) return "n/a"
  return formatInTimezone(value, tz, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
}

type Props = { rows: DashboardInsights["recurringIps"] }

export function RecurringIps({ rows }: Props) {
  const tz = useTimezone()
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-5 flex items-center gap-2">
        <Fingerprint className="h-4 w-4 text-rose-400" />
        <div>
          <h2 className="font-semibold text-foreground">Recurring IPs</h2>
          <p className="text-sm text-muted-foreground">
            Persistent sources that return after failure and rotate credentials aggressively
          </p>
        </div>
      </div>

      <div className="max-h-[540px] space-y-3 overflow-auto pr-1">
        {rows.map((row) => (
          <div key={row.srcIp} className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Link
                  href={`/sessions?q=${encodeURIComponent(row.srcIp)}`}
                  className="font-mono text-sm text-foreground transition-colors hover:text-primary"
                >
                  {row.srcIp}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.clientVersion ?? "Unknown client"} · first seen {formatDateLabel(row.firstSeen, tz)}
                </p>
              </div>
              <div className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                {row.totalSessions} sessions
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Failures</p>
                <p className="mt-1 font-semibold text-foreground">{row.failedSessions}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Successes</p>
                <p className="mt-1 font-semibold text-foreground">{row.successfulSessions}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Credential pairs</p>
                <p className="mt-1 font-semibold text-foreground">{row.credentialCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Return delay</p>
                <p className="mt-1 font-semibold text-foreground">
                  {row.returnAfterMinutes === null ? "n/a" : `${row.returnAfterMinutes} min`}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
