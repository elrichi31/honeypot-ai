"use client"

import { PatternCard, PatternRow } from "@/components/credentials/credentials-sections"
import { displayValue } from "@/lib/credentials"
import type { FilteredPatterns } from "./types"

function SprayCard({ rows }: { rows: FilteredPatterns["sprays"] }) {
  return (
    <PatternCard
      title="Password Spray Candidates"
      subtitle="Same password tested across many usernames"
      rows={rows}
      emptyText="No spray candidates found with the current data."
      renderRow={(item) => (
        <PatternRow
          key={`${item.password}-${item.ipCount}`}
          label={displayValue(item.password)}
          meta={`${item.usernameCount} usernames - ${item.ipCount} IPs`}
          value={`${item.attempts} tries`}
          tone="warning"
        />
      )}
    />
  )
}

function TargetsCard({ rows }: { rows: FilteredPatterns["targets"] }) {
  return (
    <PatternCard
      title="Targeted Usernames"
      subtitle="Accounts hit with many password variations"
      rows={rows}
      emptyText="No heavily targeted usernames found."
      renderRow={(item) => (
        <PatternRow
          key={`${item.username}-${item.ipCount}`}
          label={displayValue(item.username)}
          meta={`${item.passwordCount} passwords - ${item.ipCount} IPs`}
          value={`${item.attempts} tries`}
          tone="default"
        />
      )}
    />
  )
}

function AttackersCard({ rows }: { rows: FilteredPatterns["attackers"] }) {
  return (
    <PatternCard
      title="Diversified Attackers"
      subtitle="IPs rotating many distinct credentials"
      rows={rows}
      emptyText="No diversified attacker IPs found."
      renderRow={(item) => (
        <PatternRow
          key={`${item.srcIp}-${item.lastSeen}`}
          label={item.srcIp}
          meta={`${item.credentialCount} credential pairs - ${item.usernameCount} users`}
          value={`${item.attempts} tries`}
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
