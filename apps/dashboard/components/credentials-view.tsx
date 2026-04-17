"use client"

import { useState } from "react"
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
  filterPairs,
  filterPasswords,
  filterPatternRows,
  filterUsernames,
  percent,
  toCsv,
  type FrequencyFilter,
  type MainCredentialsTab,
  type OutcomeFilter,
  type RankingType,
} from "@/lib/credentials"
import { cn } from "@/lib/utils"
import type { CredentialsAnalytics } from "@/lib/api"

interface CredentialsViewProps {
  analytics: CredentialsAnalytics
}

export function CredentialsView({ analytics }: CredentialsViewProps) {
  const [mainTab, setMainTab] = useState<MainCredentialsTab>("rankings")
  const [rankingType, setRankingType] = useState<RankingType>("pairs")
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all")
  const [frequencyFilter, setFrequencyFilter] = useState<FrequencyFilter>("reused")
  const [search, setSearch] = useState("")

  const filteredPairs = filterPairs(analytics.topCredentials, outcomeFilter, frequencyFilter, search)
  const filteredPasswords = filterPasswords(analytics.topPasswords, outcomeFilter, search)
  const filteredUsernames = filterUsernames(analytics.topUsernames, outcomeFilter, search)
  const filteredSprays = filterPatternRows(analytics.sprayPasswords, search, (item) => item.password ?? "")
  const filteredTargets = filterPatternRows(analytics.targetedUsernames, search, (item) => item.username ?? "")
  const filteredAttackers = filterPatternRows(analytics.diversifiedAttackers, search, (item) => item.srcIp)
  const filteredRecentAttempts = analytics.recentAttempts.filter((event) => {
    const matchesOutcome =
      outcomeFilter === "all" ||
      (outcomeFilter === "success" && event.success === true) ||
      (outcomeFilter === "failed" && event.success === false)

    if (!matchesOutcome) return false
    const q = search.toLowerCase()
    if (!q) return true
    return [event.username, event.password, event.srcIp].some((value) => value?.toLowerCase().includes(q))
  })

  const currentExportRows =
    mainTab === "rankings"
      ? rankingType === "pairs"
        ? filteredPairs.map((item) => ({
            username: item.username,
            password: item.password,
            attempts: item.attempts,
            successCount: item.successCount,
            failedCount: item.failedCount,
            uniqueIps: item.uniqueIps,
            firstSeen: item.firstSeen,
            lastSeen: item.lastSeen,
          }))
        : rankingType === "passwords"
          ? filteredPasswords.map((item) => ({
              password: item.password,
              attempts: item.attempts,
              successCount: item.successCount,
              failedCount: item.failedCount,
              uniqueIps: item.uniqueIps,
              usernameCount: item.usernameCount,
            }))
          : filteredUsernames.map((item) => ({
              username: item.username,
              attempts: item.attempts,
              successCount: item.successCount,
              failedCount: item.failedCount,
              uniqueIps: item.uniqueIps,
              passwordCount: item.passwordCount,
            }))
      : mainTab === "patterns"
        ? [
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
        : filteredRecentAttempts.map((event) => ({
            status: event.success ? "success" : "failed",
            username: event.username,
            password: event.password,
            srcIp: event.srcIp,
            eventTs: event.eventTs,
            sessionId: event.sessionId,
          }))

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

    downloadTextFile(`${baseName}.json`, JSON.stringify(currentExportRows, null, 2), "application/json;charset=utf-8")
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
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search username, password, or attacker IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "success", "failed"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setOutcomeFilter(filter)}
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
              <Select value={frequencyFilter} onValueChange={(value: FrequencyFilter) => setFrequencyFilter(value)}>
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
              <Select value={rankingType} onValueChange={(value: RankingType) => setRankingType(value)}>
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

      <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as MainCredentialsTab)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="rankings">Common Credentials</TabsTrigger>
          <TabsTrigger value="patterns">Deep Analysis</TabsTrigger>
          <TabsTrigger value="recent">Recent Attempts</TabsTrigger>
        </TabsList>

        <TabsContent value="rankings">
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            {rankingType === "pairs" ? (
              <PairsTable rows={filteredPairs} />
            ) : rankingType === "passwords" ? (
              <PasswordsTable rows={filteredPasswords} />
            ) : (
              <UsernamesTable rows={filteredUsernames} />
            )}
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
                  meta={`${item.usernameCount} usernames · ${item.ipCount} IPs`}
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
                  meta={`${item.passwordCount} passwords · ${item.ipCount} IPs`}
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
                  meta={`${item.credentialCount} credential pairs · ${item.usernameCount} users`}
                  value={`${item.attempts} tries`}
                  tone="destructive"
                />
              )}
            />
          </div>
        </TabsContent>

        <TabsContent value="recent">
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <RecentAttemptsTable rows={filteredRecentAttempts} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
