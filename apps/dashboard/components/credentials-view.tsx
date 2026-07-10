"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { NavTransitionProvider, useNavTransition } from "@/lib/use-nav-transition"
import { TableLoadingOverlay } from "@/components/table-loading-overlay"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { filterPatternRows } from "@/lib/credentials"
import { SummaryStats } from "@/components/credentials/summary-stats"
import { FilterBar } from "@/components/credentials/filter-bar"
import { RankingsTab } from "@/components/credentials/rankings-tab"
import { PatternsTab } from "@/components/credentials/patterns-tab"
import { RecentTab } from "@/components/credentials/recent-tab"
import { buildExportRows, downloadCsv, downloadJson, exportBaseName } from "@/components/credentials/export-utils"
import { useT } from "@/components/locale-provider"
import type { CredentialsAnalytics, CredentialsFrequencyFilter, CredentialsMainTab, CredentialsOutcomeFilter, CredentialsRankingType } from "@/lib/api"

const DEFAULT_SORT_BY: Record<CredentialsRankingType, string> = {
  pairs: "attempts",
  passwords: "attempts",
  usernames: "attempts",
}

export function CredentialsView({ analytics }: { analytics: CredentialsAnalytics }) {
  return (
    <NavTransitionProvider>
      <CredentialsViewInner analytics={analytics} />
    </NavTransitionProvider>
  )
}

function CredentialsViewInner({ analytics }: { analytics: CredentialsAnalytics }) {
  const t = useT()
  const { pushParams, isPending } = useNavTransition()
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

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    pushParams({ search, page: "1" })
  }

  function handleMainTabChange(value: CredentialsMainTab) {
    pushParams({ mainTab: value, page: "1", sortBy: value === "recent" ? "eventTs" : DEFAULT_SORT_BY[rankingType], sortDir: "desc" })
  }

  const prefetchTab = useCallback((value: CredentialsMainTab) => {
    if (value === mainTab) return
    const next = new URLSearchParams(searchParams.toString())
    next.set("mainTab", value)
    next.set("page", "1")
    next.set("sortBy", value === "recent" ? "eventTs" : DEFAULT_SORT_BY[rankingType])
    next.set("sortDir", "desc")
    router.prefetch(`${pathname}?${next.toString()}`)
  }, [mainTab, pathname, rankingType, router, searchParams])

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
          <TabsTrigger value="rankings" onMouseEnter={() => prefetchTab("rankings")} onFocus={() => prefetchTab("rankings")}>{t("cred.tab.rankings")}</TabsTrigger>
          <TabsTrigger value="patterns" onMouseEnter={() => prefetchTab("patterns")} onFocus={() => prefetchTab("patterns")}>{t("cred.tab.patterns")}</TabsTrigger>
          <TabsTrigger value="recent" onMouseEnter={() => prefetchTab("recent")} onFocus={() => prefetchTab("recent")}>{t("cred.tab.recent")}</TabsTrigger>
        </TabsList>

        <div className="relative">
          <TableLoadingOverlay show={isPending} />

          <TabsContent value="rankings">
            <RankingsTab analytics={analytics} rankingType={rankingType} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
          </TabsContent>

          <TabsContent value="patterns">
            <PatternsTab patterns={patterns} />
          </TabsContent>

          <TabsContent value="recent">
            <RecentTab analytics={analytics} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
