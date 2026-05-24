"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { filterPatternRows } from "@/lib/credentials"
import { SummaryStats } from "@/components/credentials/summary-stats"
import { FilterBar } from "@/components/credentials/filter-bar"
import { RankingsTab } from "@/components/credentials/rankings-tab"
import { PatternsTab } from "@/components/credentials/patterns-tab"
import { RecentTab } from "@/components/credentials/recent-tab"
import { buildExportRows, downloadCsv, downloadJson, exportBaseName } from "@/components/credentials/export-utils"
import type { CredentialsAnalytics, CredentialsFrequencyFilter, CredentialsMainTab, CredentialsOutcomeFilter, CredentialsRankingType } from "@/lib/api"

const DEFAULT_SORT_BY: Record<CredentialsRankingType, string> = {
  pairs: "attempts",
  passwords: "attempts",
  usernames: "attempts",
}

export function CredentialsView({ analytics }: { analytics: CredentialsAnalytics }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(analytics.current.search)

  useEffect(() => { setSearch(analytics.current.search) }, [analytics.current.search])

  const { mainTab, rankingType, outcome: outcomeFilter, frequency: frequencyFilter, sortBy, sortDir } = analytics.current

  const patterns = useMemo(() => ({
    sprays: filterPatternRows(analytics.sprayPasswords, search, (item) => item.password ?? ""),
    targets: filterPatternRows(analytics.targetedUsernames, search, (item) => item.username ?? ""),
    attackers: filterPatternRows(analytics.diversifiedAttackers, search, (item) => item.srcIp),
  }), [analytics.sprayPasswords, analytics.targetedUsernames, analytics.diversifiedAttackers, search])

  const exportRows = useMemo(
    () => buildExportRows(mainTab, rankingType, analytics, patterns),
    [mainTab, rankingType, analytics, patterns],
  )

  function pushParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) next.set(key, value)
    router.push(`${pathname}?${next.toString()}`)
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    pushParams({ search, page: "1" })
  }

  function handleMainTabChange(value: CredentialsMainTab) {
    pushParams({ mainTab: value, page: "1", sortBy: value === "recent" ? "eventTs" : DEFAULT_SORT_BY[rankingType], sortDir: "desc" })
  }

  function handleRankingTypeChange(value: CredentialsRankingType) {
    pushParams({ rankingType: value, page: "1", sortBy: DEFAULT_SORT_BY[value], sortDir: "desc" })
  }

  function handleSort(column: string) {
    const nextSortDir = sortBy === column && sortDir === "desc" ? "asc" : "desc"
    pushParams({ sortBy: column, sortDir: nextSortDir, page: "1" })
  }

  function clearSearch() {
    setSearch("")
    pushParams({ search: "", page: "1" })
  }

  const baseName = exportBaseName(mainTab, rankingType)

  return (
    <div className="space-y-6">
      <SummaryStats summary={analytics.summary} />

      <FilterBar
        search={search}
        activeSearch={analytics.current.search}
        mainTab={mainTab}
        rankingType={rankingType}
        outcomeFilter={outcomeFilter}
        frequencyFilter={frequencyFilter}
        visibleRowCount={exportRows.length}
        onSearchChange={setSearch}
        onSearchSubmit={handleSearchSubmit}
        onClearSearch={clearSearch}
        onOutcomeChange={(v: CredentialsOutcomeFilter) => pushParams({ outcome: v, page: "1" })}
        onFrequencyChange={(v: CredentialsFrequencyFilter) => pushParams({ frequency: v, page: "1" })}
        onRankingTypeChange={handleRankingTypeChange}
        onDownloadCsv={() => downloadCsv(baseName, exportRows)}
        onDownloadJson={() => downloadJson(baseName, exportRows)}
      />

      <Tabs value={mainTab} onValueChange={(v) => handleMainTabChange(v as CredentialsMainTab)} className="space-y-4">
        <TabsList className="flex h-auto w-fit flex-wrap gap-1 rounded-lg bg-secondary p-1">
          <TabsTrigger value="rankings">Common Credentials</TabsTrigger>
          <TabsTrigger value="patterns">Deep Analysis</TabsTrigger>
          <TabsTrigger value="recent">Recent Attempts</TabsTrigger>
        </TabsList>

        <TabsContent value="rankings">
          <RankingsTab analytics={analytics} rankingType={rankingType} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
        </TabsContent>

        <TabsContent value="patterns">
          <PatternsTab patterns={patterns} />
        </TabsContent>

        <TabsContent value="recent">
          <RecentTab analytics={analytics} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
