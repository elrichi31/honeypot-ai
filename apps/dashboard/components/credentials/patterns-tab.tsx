"use client"

import { PatternCard, PatternRow } from "@/components/credentials/credentials-sections"
import { displayValue } from "@/lib/credentials"
import { useT } from "@/components/locale-provider"
import type { FilteredPatterns } from "./types"

function SprayCard({ rows }: { rows: FilteredPatterns["sprays"] }) {
  const t = useT()
  return (
    <PatternCard
      title={t("cred.pattern.sprayTitle")}
      subtitle={t("cred.pattern.spraySubtitle")}
      rows={rows}
      emptyText={t("cred.pattern.sprayEmpty")}
      renderRow={(item) => (
        <PatternRow
          key={`${item.password}-${item.ipCount}`}
          label={displayValue(item.password)}
          meta={t("cred.pattern.metaSpray", { users: item.usernameCount, ips: item.ipCount })}
          value={t("cred.pattern.tries", { count: item.attempts })}
          tone="warning"
        />
      )}
    />
  )
}

function TargetsCard({ rows }: { rows: FilteredPatterns["targets"] }) {
  const t = useT()
  return (
    <PatternCard
      title={t("cred.pattern.targetsTitle")}
      subtitle={t("cred.pattern.targetsSubtitle")}
      rows={rows}
      emptyText={t("cred.pattern.targetsEmpty")}
      renderRow={(item) => (
        <PatternRow
          key={`${item.username}-${item.ipCount}`}
          label={displayValue(item.username)}
          meta={t("cred.pattern.metaTargets", { passwords: item.passwordCount, ips: item.ipCount })}
          value={t("cred.pattern.tries", { count: item.attempts })}
          tone="default"
        />
      )}
    />
  )
}

function AttackersCard({ rows }: { rows: FilteredPatterns["attackers"] }) {
  const t = useT()
  return (
    <PatternCard
      title={t("cred.pattern.attackersTitle")}
      subtitle={t("cred.pattern.attackersSubtitle")}
      rows={rows}
      emptyText={t("cred.pattern.attackersEmpty")}
      renderRow={(item) => (
        <PatternRow
          key={`${item.srcIp}-${item.lastSeen}`}
          label={item.srcIp}
          meta={t("cred.pattern.metaAttackers", { pairs: item.credentialCount, users: item.usernameCount })}
          value={t("cred.pattern.tries", { count: item.attempts })}
          tone="destructive"
        />
      )}
    />
  )
}

export function PatternsTab({ patterns }: { patterns: FilteredPatterns }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <SprayCard rows={patterns.sprays} />
      <TargetsCard rows={patterns.targets} />
      <AttackersCard rows={patterns.attackers} />
    </div>
  )
}
