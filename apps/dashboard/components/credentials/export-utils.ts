import { toCsv, downloadTextFile } from "@/lib/credentials"
import type {
  CredentialPairStat,
  CredentialsAnalytics,
  CredentialsMainTab,
  CredentialsRankingType,
  HoneypotEvent,
  PasswordCredentialStat,
  UsernameCredentialStat,
} from "@/lib/api"
import type { FilteredPatterns } from "./types"

function pairsExportRows(rows: CredentialPairStat[]) {
  return rows.map((item) => ({
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

function passwordsExportRows(rows: PasswordCredentialStat[]) {
  return rows.map((item) => ({
    password: item.password,
    attempts: item.attempts,
    successCount: item.successCount,
    failedCount: item.failedCount,
    uniqueIps: item.uniqueIps,
    usernameCount: item.usernameCount,
  }))
}

function usernamesExportRows(rows: UsernameCredentialStat[]) {
  return rows.map((item) => ({
    username: item.username,
    attempts: item.attempts,
    successCount: item.successCount,
    failedCount: item.failedCount,
    uniqueIps: item.uniqueIps,
    passwordCount: item.passwordCount,
  }))
}

function patternsExportRows(patterns: FilteredPatterns) {
  return [
    ...patterns.sprays.map((item) => ({
      patternType: "password_spray",
      password: item.password,
      attempts: item.attempts,
      successCount: item.successCount,
      usernameCount: item.usernameCount,
      ipCount: item.ipCount,
    })),
    ...patterns.targets.map((item) => ({
      patternType: "targeted_username",
      username: item.username,
      attempts: item.attempts,
      successCount: item.successCount,
      passwordCount: item.passwordCount,
      ipCount: item.ipCount,
    })),
    ...patterns.attackers.map((item) => ({
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

function recentExportRows(rows: HoneypotEvent[]) {
  return rows.map((event) => ({
    status: event.success ? "success" : "failed",
    username: event.username,
    password: event.password,
    srcIp: event.srcIp,
    eventTs: event.eventTs,
    sessionId: event.sessionId,
  }))
}

export function buildExportRows(
  mainTab: CredentialsMainTab,
  rankingType: CredentialsRankingType,
  analytics: CredentialsAnalytics,
  patterns: FilteredPatterns,
) {
  if (mainTab === "rankings") {
    const rows = analytics.rankingsPage.items
    if (rankingType === "pairs") return pairsExportRows(rows as CredentialPairStat[])
    if (rankingType === "passwords") return passwordsExportRows(rows as PasswordCredentialStat[])
    return usernamesExportRows(rows as UsernameCredentialStat[])
  }
  if (mainTab === "patterns") return patternsExportRows(patterns)
  return recentExportRows(analytics.recentAttemptsPage.items as HoneypotEvent[])
}

export function downloadCsv(baseName: string, rows: Record<string, unknown>[]) {
  downloadTextFile(`${baseName}.csv`, toCsv(rows as Record<string, string | number | boolean | null>[]), "text/csv;charset=utf-8")
}

export function downloadJson(baseName: string, rows: Record<string, unknown>[]) {
  downloadTextFile(`${baseName}.json`, JSON.stringify(rows, null, 2), "application/json;charset=utf-8")
}

export function exportBaseName(mainTab: CredentialsMainTab, rankingType: CredentialsRankingType) {
  if (mainTab === "rankings") return `credentials-${rankingType}`
  if (mainTab === "patterns") return "credentials-patterns"
  return "credentials-recent-attempts"
}
