"use client"

import { Download, Filter, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type {
  CredentialsFrequencyFilter,
  CredentialsMainTab,
  CredentialsOutcomeFilter,
  CredentialsRankingType,
} from "@/lib/api"

interface Props {
  search: string
  activeSearch: string
  mainTab: CredentialsMainTab
  rankingType: CredentialsRankingType
  outcomeFilter: CredentialsOutcomeFilter
  frequencyFilter: CredentialsFrequencyFilter
  visibleRowCount: number
  onSearchChange: (value: string) => void
  onSearchSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onClearSearch: () => void
  onOutcomeChange: (value: CredentialsOutcomeFilter) => void
  onFrequencyChange: (value: CredentialsFrequencyFilter) => void
  onRankingTypeChange: (value: CredentialsRankingType) => void
  onDownloadCsv: () => void
  onDownloadJson: () => void
}

export function FilterBar({
  search, activeSearch, mainTab, rankingType, outcomeFilter, frequencyFilter,
  visibleRowCount, onSearchChange, onSearchSubmit, onClearSearch,
  onOutcomeChange, onFrequencyChange, onRankingTypeChange, onDownloadCsv, onDownloadJson,
}: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <form onSubmit={onSearchSubmit} className="flex min-w-[320px] flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search username, password, or attacker IP..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" variant="outline">Search</Button>
          {activeSearch && (
            <Button type="button" variant="ghost" onClick={onClearSearch}>Clear</Button>
          )}
        </form>

        <div className="flex flex-1 flex-wrap items-center gap-2 2xl:justify-end">
          <OutcomeButtons outcomeFilter={outcomeFilter} onOutcomeChange={onOutcomeChange} />

          {mainTab === "rankings" && rankingType === "pairs" && (
            <Select value={frequencyFilter} onValueChange={(v: CredentialsFrequencyFilter) => onFrequencyChange(v)}>
              <SelectTrigger className="w-[170px]">
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
            <Select value={rankingType} onValueChange={(v: CredentialsRankingType) => onRankingTypeChange(v)}>
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

          <span className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            {visibleRowCount} visible rows
          </span>

          <Button variant="outline" size="sm" onClick={onDownloadCsv}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={onDownloadJson}>
            <Download className="h-4 w-4" />
            JSON
          </Button>
        </div>
      </div>
    </div>
  )
}

function OutcomeButtons({
  outcomeFilter,
  onOutcomeChange,
}: {
  outcomeFilter: CredentialsOutcomeFilter
  onOutcomeChange: (value: CredentialsOutcomeFilter) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(["all", "success", "failed"] as const).map((filter) => (
        <button
          key={filter}
          onClick={() => onOutcomeChange(filter)}
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
  )
}
