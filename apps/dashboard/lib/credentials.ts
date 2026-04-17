import type {
  CredentialPairStat,
  DiversifiedAttackerStat,
  PasswordCredentialStat,
  SprayPasswordStat,
  TargetedUsernameStat,
  UsernameCredentialStat,
} from "./api"

export type MainCredentialsTab = "rankings" | "patterns" | "recent"
export type RankingType = "pairs" | "passwords" | "usernames"
export type OutcomeFilter = "all" | "success" | "failed"
export type FrequencyFilter = "all" | "reused" | "single"

export function displayValue(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : "-"
}

export function percent(success: number, total: number) {
  if (!total) return "0.0%"
  return `${((success / total) * 100).toFixed(1)}%`
}

export function matchesSearch(values: Array<string | null | undefined>, search: string) {
  if (!search) return true
  const q = search.toLowerCase()
  return values.some((value) => value?.toLowerCase().includes(q))
}

export function filterPairs(
  rows: CredentialPairStat[],
  outcomeFilter: OutcomeFilter,
  frequencyFilter: FrequencyFilter,
  search: string,
) {
  return rows.filter((item) => {
    const matchesOutcome =
      outcomeFilter === "all" ||
      (outcomeFilter === "success" && item.successCount > 0) ||
      (outcomeFilter === "failed" && item.failedCount > 0)

    const matchesFrequency =
      frequencyFilter === "all" ||
      (frequencyFilter === "reused" && item.attempts > 1) ||
      (frequencyFilter === "single" && item.attempts === 1)

    return matchesOutcome && matchesFrequency && matchesSearch([item.username, item.password], search)
  })
}

export function filterPasswords(
  rows: PasswordCredentialStat[],
  outcomeFilter: OutcomeFilter,
  search: string,
) {
  return rows.filter((item) => {
    const metric =
      outcomeFilter === "success"
        ? item.successCount
        : outcomeFilter === "failed"
          ? item.failedCount
          : item.attempts

    return metric > 0 && matchesSearch([item.password], search)
  })
}

export function filterUsernames(
  rows: UsernameCredentialStat[],
  outcomeFilter: OutcomeFilter,
  search: string,
) {
  return rows.filter((item) => {
    const metric =
      outcomeFilter === "success"
        ? item.successCount
        : outcomeFilter === "failed"
          ? item.failedCount
          : item.attempts

    return metric > 0 && matchesSearch([item.username], search)
  })
}

export function filterPatternRows<T extends SprayPasswordStat | TargetedUsernameStat | DiversifiedAttackerStat>(
  rows: T[],
  search: string,
  selector: (row: T) => string,
) {
  return rows.filter((row) => matchesSearch([selector(row)], search))
}

export function toCsv(rows: Record<string, string | number | boolean | null>[]) {
  if (!rows.length) return ""

  const headers = Object.keys(rows[0])
  const escape = (value: string | number | boolean | null) => {
    const text = value == null ? "" : String(value)
    const normalized = text.replace(/"/g, '""')
    return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized
  }

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header] ?? null)).join(",")),
  ].join("\n")
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
