"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Download,
  Filter,
  Search,
  Shield,
  ShieldAlert,
  ShieldX,
  Target,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  PairsTable,
  PasswordsTable,
  PatternCard,
  PatternRow,
  RecentAttemptsTable,
  UsernamesTable,
} from "@/components/credentials/credentials-sections"
import {
  displayValue,
  downloadTextFile,
  filterPatternRows,
  percent,
  toCsv,
} from "@/lib/credentials"
import { TablePagination } from "@/components/table-pagination"
import { cn } from "@/lib/utils"
import type {
  CredentialPairStat,
  CredentialsAnalytics,
  CredentialsFrequencyFilter,
  CredentialsMainTab,
  CredentialsOutcomeFilter,
  CredentialsRankingType,
  HoneypotEvent,
  PasswordCredentialStat,
  UsernameCredentialStat,
} from "@/lib/api"

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

  useEffect(() => {
    setSearch(analytics.current.search)
  }, [analytics.current.search])

  const mainTab = analytics.current.mainTab
  const rankingType = analytics.current.rankingType
  const outcomeFilter = analytics.current.outcome
  const frequencyFilter = analytics.current.frequency
  const sortBy = analytics.current.sortBy
  const sortDir = analytics.current.sortDir

  const filteredSprays = filterPatternRows(
    analytics.sprayPasswords,
    search,
    (item) => item.password ?? "",
  )
  const filteredTargets = filterPatternRows(
    analytics.targetedUsernames,
    search,
    (item) => item.username ?? "",
  )
  const filteredAttackers = filterPatternRows(
    analytics.diversifiedAttackers,
    search,
    (item) => item.srcIp,
  )

  const rankingRows = analytics.rankingsPage.items
  const recentRows = analytics.recentAttemptsPage.items

  const currentExportRows = useMemo(() => {
    if (mainTab === "rankings") {
      if (rankingType === "pairs") {
        return (rankingRows as CredentialPairStat[]).map((item) => ({
          username: item.username,
          password: item.password,
          attempts: item.attempts,
          successCount: item.successCount,
          failedCount: item.failedCount,
          uniqueIps: item.uniqueIps,
          firstSeen: item.firstSeen,
          lastSeen: item.lastSeen,
        }))
      }

      if (rankingType === "passwords") {
        return (rankingRows as PasswordCredentialStat[]).map((item) => ({
          password: item.password,
          attempts: item.attempts,
          successCount: item.successCount,
          failedCount: item.failedCount,
          uniqueIps: item.uniqueIps,
          usernameCount: item.usernameCount,
        }))
      }

      return (rankingRows as UsernameCredentialStat[]).map((item) => ({
        username: item.username,
        attempts: item.attempts,
        successCount: item.successCount,
        failedCount: item.failedCount,
        uniqueIps: item.uniqueIps,
        passwordCount: item.passwordCount,
      }))
    }

    if (mainTab === "patterns") {
      return [
        ...filteredSprays.map((item) => ({
          patternType: "password_spray",
          password: item.password,
          attempts: item.attempts,
          successCount: item.successCount,
          usernameCount: item.usernameCount,
          ipCount: item.ipCount,
        })),
        ...filteredTargets.map((item) => ({
          patternType: "targeted_username",
          username: item.username,
          attempts: item.attempts,
          successCount: item.successCount,
          passwordCount: item.passwordCount,
          ipCount: item.ipCount,
        })),
        ...filteredAttackers.map((item) => ({
          patternType: "diversified_attacker",
          srcIp: item.srcIp,
          attempts: item.attempts,
          successCount: item.successCount,
          credentialCount: item.credentialCount,
          usernameCount: item.usernameCount,
          passwordCount: item.passwordCount,
          lastSeen: item.lastSeen,
        })),
      ]
    }

    return (recentRows as HoneypotEvent[]).map((event) => ({
      status: event.success ? "success" : "failed",
      username: event.username,
      password: event.password,
      srcIp: event.srcIp,
      eventTs: event.eventTs,
      sessionId: event.sessionId,
    }))
  }, [mainTab, rankingRows, rankingType, recentRows, filteredSprays, filteredTargets, filteredAttackers])

  function pushParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString())

    for (const [key, value] of Object.entries(updates)) {
      next.set(key, value)
    }

    router.push(`${pathname}?${next.toString()}`)
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    pushParams({
      search,
      page: "1",
    })
  }

  function setMainTab(value: CredentialsMainTab) {
    pushParams({
      mainTab: value,
      page: "1",
      sortBy: value === "recent" ? "eventTs" : DEFAULT_SORT_BY[rankingType],
      sortDir: "desc",
    })
  }

  function setRankingType(value: CredentialsRankingType) {
    pushParams({
      rankingType: value,
      page: "1",
      sortBy: DEFAULT_SORT_BY[value],
      sortDir: "desc",
    })
  }

  function setOutcome(value: CredentialsOutcomeFilter) {
    pushParams({ outcome: value, page: "1" })
  }

  function setFrequency(value: CredentialsFrequencyFilter) {
    pushParams({ frequency: value, page: "1" })
  }

  function handleSort(column: string) {
    const nextSortDir = sortBy === column && sortDir === "desc" ? "asc" : "desc"
    pushParams({
      sortBy: column,
      sortDir: nextSortDir,
      page: "1",
    })
  }

  function clearSearch() {
    setSearch("")
    pushParams({ search: "", page: "1" })
  }

  function downloadCurrentView(formatType: "csv" | "json") {
    const baseName =
      mainTab === "rankings"
        ? `credentials-${rankingType}`
        : mainTab === "patterns"
          ? "credentials-patterns"
          : "credentials-recent-attempts"

    if (formatType === "csv") {
      downloadTextFile(`${baseName}.csv`, toCsv(currentExportRows), "text/csv;charset=utf-8")
      return
    }

    downloadTextFile(
      `${baseName}.json`,
      JSON.stringify(currentExportRows, null, 2),
      "application/json;charset=utf-8",
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-success" />
            Successful
          </div>
          <p className="mt-2 text-3xl font-bold text-success">{analytics.summary.successfulAttempts}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {percent(analytics.summary.successfulAttempts, analytics.summary.totalAttempts)} success rate
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldX className="h-4 w-4 text-destructive" />
            Failed
          </div>
          <p className="mt-2 text-3xl font-bold text-destructive">{analytics.summary.failedAttempts}</p>
          <p className="mt-1 text-xs text-muted-foreground">{analytics.summary.totalAttempts} total attempts</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 text-chart-1" />
            Credential Pairs
          </div>
          <p className="mt-2 text-3xl font-bold text-chart-1">{analytics.summary.uniqueCredentialPairs}</p>
          <p className="mt-1 text-xs text-muted-foreground">{analytics.summary.repeatedCredentialPairs} repeated pairs</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4 text-warning" />
            Spray Signals
          </div>
          <p className="mt-2 text-3xl font-bold text-warning">{analytics.summary.sprayPasswords}</p>
          <p className="mt-1 text-xs text-muted-foreground">passwords reused across many accounts</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="h-4 w-4 text-chart-3" />
            Targeted Users
          </div>
          <p className="mt-2 text-3xl font-bold text-chart-3">{analytics.summary.targetedUsernames}</p>
          <p className="mt-1 text-xs text-muted-foreground">usernames with many password guesses</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-4 lg:flex-row">
            <form onSubmit={handleSearchSubmit} className="flex flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search username, password, or attacker IP..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit" variant="outline">Search</Button>
              {analytics.current.search && (
                <Button type="button" variant="ghost" onClick={clearSearch}>Clear</Button>
              )}
            </form>
            <div className="flex flex-wrap gap-2">
              {(["all", "success", "failed"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setOutcome(filter)}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                    outcomeFilter === filter
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mainTab === "rankings" && rankingType === "pairs" && (
              <Select value={frequencyFilter} onValueChange={(value: CredentialsFrequencyFilter) => setFrequency(value)}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="h-4 w-4" />
                  <SelectValue placeholder="Frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All pairs</SelectItem>
                  <SelectItem value="reused">Repeated only</SelectItem>
                  <SelectItem value="single">One-off only</SelectItem>
                </SelectContent>
              </Select>
            )}
            {mainTab === "rankings" && (
              <Select value={rankingType} onValueChange={(value: CredentialsRankingType) => setRankingType(value)}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Ranking type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pairs">Credential pairs</SelectItem>
                  <SelectItem value="passwords">Passwords</SelectItem>
                  <SelectItem value="usernames">Usernames</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={() => downloadCurrentView("csv")}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCurrentView("json")}>
              <Download className="h-4 w-4" />
              JSON
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as CredentialsMainTab)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="rankings">Common Credentials</TabsTrigger>
          <TabsTrigger value="patterns">Deep Analysis</TabsTrigger>
          <TabsTrigger value="recent">Recent Attempts</TabsTrigger>
        </TabsList>

        <TabsContent value="rankings">
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            {rankingType === "pairs" ? (
              <PairsTable
                rows={rankingRows as CredentialPairStat[]}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
              />
            ) : rankingType === "passwords" ? (
              <PasswordsTable
                rows={rankingRows as PasswordCredentialStat[]}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
              />
            ) : (
              <UsernamesTable
                rows={rankingRows as UsernameCredentialStat[]}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
              />
            )}
            <TablePagination pagination={analytics.rankingsPage.pagination} />
          </div>
        </TabsContent>

        <TabsContent value="patterns">
          <div className="grid gap-4 xl:grid-cols-3">
            <PatternCard
              title="Password Spray Candidates"
              subtitle="Same password tested across many usernames"
              rows={filteredSprays}
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
            <PatternCard
              title="Targeted Usernames"
              subtitle="Accounts hit with many password variations"
              rows={filteredTargets}
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
            <PatternCard
              title="Diversified Attackers"
              subtitle="IPs rotating many distinct credentials"
              rows={filteredAttackers}
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
          </div>
        </TabsContent>

        <TabsContent value="recent">
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <RecentAttemptsTable
              rows={recentRows}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <TablePagination pagination={analytics.recentAttemptsPage.pagination} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
