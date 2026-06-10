"use client"

import { Shield, ShieldAlert, ShieldX, Target, Users } from "lucide-react"
import { percent } from "@/lib/credentials"
import { useT } from "@/components/locale-provider"
import type { CredentialsAnalytics } from "@/lib/api"

function StatCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">{children}</div>
  )
}

export function SummaryStats({ summary }: { summary: CredentialsAnalytics["summary"] }) {
  const t = useT()
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4 text-success" />
          {t("cred.summary.successful")}
        </div>
        <p className="mt-2 text-3xl font-bold text-success">{summary.successfulAttempts}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("cred.summary.successRate", { rate: percent(summary.successfulAttempts, summary.totalAttempts) })}
        </p>
      </StatCard>

      <StatCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldX className="h-4 w-4 text-destructive" />
          {t("cred.summary.failed")}
        </div>
        <p className="mt-2 text-3xl font-bold text-destructive">{summary.failedAttempts}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("cred.summary.totalAttempts", { count: summary.totalAttempts })}</p>
      </StatCard>

      <StatCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4 text-chart-1" />
          {t("cred.summary.credentialPairs")}
        </div>
        <p className="mt-2 text-3xl font-bold text-chart-1">{summary.uniqueCredentialPairs}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("cred.summary.repeatedPairs", { count: summary.repeatedCredentialPairs })}</p>
      </StatCard>

      <StatCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4 text-warning" />
          {t("cred.summary.spraySignals")}
        </div>
        <p className="mt-2 text-3xl font-bold text-warning">{summary.sprayPasswords}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("cred.summary.sprayHint")}</p>
      </StatCard>

      <StatCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Target className="h-4 w-4 text-chart-3" />
          {t("cred.summary.targetedUsers")}
        </div>
        <p className="mt-2 text-3xl font-bold text-chart-3">{summary.targetedUsernames}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("cred.summary.targetedHint")}</p>
      </StatCard>
    </div>
  )
}
