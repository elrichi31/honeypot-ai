"use client"

import { RecentAttemptsTable } from "@/components/credentials/credentials-sections"
import { TablePagination } from "@/components/table-pagination"
import type { CredentialsAnalytics } from "@/lib/api"

const TABLE_PANEL_CLASS =
  "flex min-h-[620px] max-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-xl border border-border bg-card"

interface Props {
  analytics: CredentialsAnalytics
  sortBy: string
  sortDir: "asc" | "desc"
  onSort: (column: string) => void
}

export function RecentTab({ analytics, sortBy, sortDir, onSort }: Props) {
  return (
    <div className={TABLE_PANEL_CLASS}>
      <div className="min-h-0 flex-1 overflow-auto">
        <RecentAttemptsTable
          rows={analytics.recentAttemptsPage.items}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={onSort}
        />
      </div>
      <TablePagination pagination={analytics.recentAttemptsPage.pagination} />
    </div>
  )
}
