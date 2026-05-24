"use client"

import { Shield, ShieldAlert, ShieldX, Target, Users } from "lucide-react"
import { percent } from "@/lib/credentials"
import type { CredentialsAnalytics } from "@/lib/api"

function StatCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">{children}</div>
  )
}

export function SummaryStats({ summary }: { summary: CredentialsAnalytics["summary"] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4 text-success" />
          Successful
        </div>
        <p className="mt-2 text-3xl font-bold text-success">{summary.successfulAttempts}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {percent(summary.successfulAttempts, summary.totalAttempts)} success rate
        </p>
      </StatCard>

      <StatCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldX className="h-4 w-4 text-destructive" />
          Failed
        </div>
        <p className="mt-2 text-3xl font-bold text-destructive">{summary.failedAttempts}</p>
        <p className="mt-1 text-xs text-muted-foreground">{summary.totalAttempts} total attempts</p>
      </StatCard>

      <StatCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4 text-chart-1" />
          Credential Pairs
        </div>
        <p className="mt-2 text-3xl font-bold text-chart-1">{summary.uniqueCredentialPairs}</p>
        <p className="mt-1 text-xs text-muted-foreground">{summary.repeatedCredentialPairs} repeated pairs</p>
      </StatCard>

      <StatCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4 text-warning" />
          Spray Signals
        </div>
        <p className="mt-2 text-3xl font-bold text-warning">{summary.sprayPasswords}</p>
        <p className="mt-1 text-xs text-muted-foreground">passwords reused across many accounts</p>
      </StatCard>

      <StatCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Target className="h-4 w-4 text-chart-3" />
          Targeted Users
        </div>
        <p className="mt-2 text-3xl font-bold text-chart-3">{summary.targetedUsernames}</p>
        <p className="mt-1 text-xs text-muted-foreground">usernames with many password guesses</p>
      </StatCard>
    </div>
  )
}
