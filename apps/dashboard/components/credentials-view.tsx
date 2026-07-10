"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
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
import { fetchCredentialsAnalyticsClient } from "@/lib/api"
import type { CredentialsAnalytics, CredentialsFrequencyFilter, CredentialsMainTab, CredentialsOutcomeFilter, CredentialsRankingType } from "@/lib/api"

const DEFAULT_SORT_BY: Record<CredentialsRankingType, string> = {
  pairs: "attempts",
  passwords: "attempts",
  usernames: "attempts",
}

export function CredentialsView({ analytics, scope }: {
  analytics: CredentialsAnalytics
  scope: { clientSlug?: string; sensorId?: string }
}) {
  return (
    <NavTransitionProvider>
      <CredentialsViewInner analytics={analytics} scope={scope} />
    </NavTransitionProvider>
  )
}

function CredentialsViewInner({ analytics, scope }: {
  analytics: CredentialsAnalytics
  scope: { clientSlug?: string; sensorId?: string }
}) {
  const t = useT()
  const { pushParams, isPending } = useNavTransition()
  const tabCache = useRef(new Map<string, CredentialsAnalytics>())
  const [activeAnalytics, setActiveAnalytics] = useState(analytics)
  const [activeTab, setActiveTab] = useState(analytics.current.mainTab)
  const [tabError, setTabError] = useState<string | null>(null)
  const [isTabPending, startTabTransition] = useTransition()
  const [search, setSearch] = useState(analytics.current.search)

  useEffect(() => {
    setSearch(analytics.current.search)
    setActiveAnalytics(analytics)
    setActiveTab(analytics.current.mainTab)
    tabCache.current.clear()
  }, [analytics])

  const { rankingType, outcome: outcomeFilter, frequency: frequencyFilter, sortBy, sortDir } = activeAnalytics.current

  const patterns = useMemo(() => ({
    sprays: filterPatternRows(activeAnalytics.sprayPasswords, search, (item) => item.password ?? ""),
    targets: filterPatternRows(activeAnalytics.targetedUsernames, search, (item) => item.username ?? ""),
    attackers: filterPatternRows(activeAnalytics.diversifiedAttackers, search, (item) => item.srcIp),
  }), [activeAnalytics.sprayPasswords, activeAnalytics.targetedUsernames, activeAnalytics.diversifiedAttackers, search])

  const exportRows = useMemo(
    () => buildExportRows(activeTab, rankingType, activeAnalytics, patterns),
    [activeTab, rankingType, activeAnalytics, patterns],
  )

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    pushParams({ search, page: "1" })
  }

  function handleMainTabChange(value: CredentialsMainTab) {
    if (value === activeTab) return
    setActiveTab(value)
    setTabError(null)
    const sortByForTab = value === "recent" ? "eventTs" : DEFAULT_SORT_BY[rankingType]
    const urlParams = new URLSearchParams(window.location.search)
    urlParams.set("mainTab", value)
    urlParams.set("page", "1")
    urlParams.set("sortBy", sortByForTab)
    urlParams.set("sortDir", "desc")
    window.history.pushState(null, "", `${window.location.pathname}?${urlParams.toString()}`)
    const cacheKey = JSON.stringify({ value, rankingType, outcome: outcomeFilter, frequency: frequencyFilter, search: activeAnalytics.current.search, sortBy: sortByForTab, scope })
    const cached = tabCache.current.get(cacheKey)
    if (cached) {
      setActiveAnalytics(cached)
      return
    }
    startTabTransition(async () => {
      try {
        const next = await fetchCredentialsAnalyticsClient({
          mainTab: value,
          rankingType,
          outcome: outcomeFilter,
          frequency: frequencyFilter,
          search: activeAnalytics.current.search || undefined,
          sortBy: sortByForTab,
          sortDir: "desc",
          page: 1,
          pageSize: activeAnalytics.rankingsPage.pagination.pageSize,
          clientSlug: scope.clientSlug,
          sensorId: scope.sensorId,
        })
        tabCache.current.set(cacheKey, next)
        setActiveAnalytics(next)
      } catch {
        setTabError(t("cred.tabLoadError"))
      }
    })
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

  const baseName = exportBaseName(activeTab, rankingType)

  return (
    <div className="space-y-6">
      <SummaryStats summary={activeAnalytics.summary} />

      <FilterBar
        search={search}
        activeSearch={analytics.current.search}
        mainTab={activeTab}
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

      <Tabs value={activeTab} onValueChange={(v) => handleMainTabChange(v as CredentialsMainTab)} className="space-y-4">
        <TabsList className="flex h-auto w-fit flex-wrap gap-1 rounded-lg bg-secondary p-1">
          <TabsTrigger value="rankings">{t("cred.tab.rankings")}</TabsTrigger>
          <TabsTrigger value="patterns">{t("cred.tab.patterns")}</TabsTrigger>
          <TabsTrigger value="recent">{t("cred.tab.recent")}</TabsTrigger>
        </TabsList>

        <div className="relative">
          <TableLoadingOverlay show={isPending || isTabPending} />

          <TabsContent value="rankings">
            {isTabPending ? <TabState /> : <RankingsTab analytics={activeAnalytics} rankingType={rankingType} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />}
          </TabsContent>

          <TabsContent value="patterns">
            {isTabPending ? <TabState /> : <PatternsTab patterns={patterns} />}
          </TabsContent>

          <TabsContent value="recent">
            {isTabPending ? <TabState /> : <RecentTab analytics={activeAnalytics} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />}
          </TabsContent>
          {tabError && <p className="mt-3 text-sm text-destructive">{tabError}</p>}
        </div>
      </Tabs>
    </div>
  )
}

function TabState() {
  return <div className="min-h-[320px] rounded-xl border border-border bg-card" />
}
