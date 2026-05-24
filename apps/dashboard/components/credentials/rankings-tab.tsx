"use client"

import {
  PairsTable,
  PasswordsTable,
  UsernamesTable,
} from "@/components/credentials/credentials-sections"
import { TablePagination } from "@/components/table-pagination"
import type {
  CredentialPairStat,
  CredentialsAnalytics,
  CredentialsRankingType,
  PasswordCredentialStat,
  UsernameCredentialStat,
} from "@/lib/api"

const TABLE_PANEL_CLASS =
  "flex min-h-[620px] max-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-xl border border-border bg-card"

interface Props {
  analytics: CredentialsAnalytics
  rankingType: CredentialsRankingType
  sortBy: string
  sortDir: "asc" | "desc"
  onSort: (column: string) => void
}

function RankingTable({ rankingType, rows, sortBy, sortDir, onSort }: {
  rankingType: CredentialsRankingType
  rows: CredentialsAnalytics["rankingsPage"]["items"]
  sortBy: string
  sortDir: "asc" | "desc"
  onSort: (column: string) => void
}) {
  if (rankingType === "pairs") {
    return <PairsTable rows={rows as CredentialPairStat[]} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
  }
  if (rankingType === "passwords") {
    return <PasswordsTable rows={rows as PasswordCredentialStat[]} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
  }
  return <UsernamesTable rows={rows as UsernameCredentialStat[]} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
}

export function RankingsTab({ analytics, rankingType, sortBy, sortDir, onSort }: Props) {
  return (
    <div className={TABLE_PANEL_CLASS}>
      <div className="min-h-0 flex-1 overflow-auto">
        <RankingTable
          rankingType={rankingType}
          rows={analytics.rankingsPage.items}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={onSort}
        />
      </div>
      <TablePagination pagination={analytics.rankingsPage.pagination} />
    </div>
  )
}
