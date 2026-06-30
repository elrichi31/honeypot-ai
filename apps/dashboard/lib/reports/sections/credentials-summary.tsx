import React from "react"
import type { ClientReportData } from "../types"
import { fmt, pct, rate, truncPassword } from "../shared/format"
import { KpiCard, s, SectionHeader, SimpleTable, type T } from "../shared/pdf-ui"
import { Text, View } from "@react-pdf/renderer"

export function CredentialsSummarySection({ data, t }: { data: ClientReportData; t: T }) {
  const { credentialSummary, diversifiedAttackers, topCredentials, sensors } = data
  const hasCredentialSensor =
    credentialSummary.totalAttempts > 0 ||
    topCredentials.length > 0 ||
    sensors.some((profile) => profile.authAttempts > 0 || profile.topCredentials.length > 0)

  if (!hasCredentialSensor) return null

  const credentialRows = topCredentials.slice(0, 10).map((credential) => [
    credential.username ?? "-",
    truncPassword(credential.password),
    fmt(credential.attempts),
    fmt(credential.successCount),
    rate(credential.successCount, credential.attempts),
  ])

  const diversifiedRows = diversifiedAttackers.slice(0, 6).map((ip) => [
    ip.srcIp,
    fmt(ip.attempts),
    fmt(ip.credentialCount),
    fmt(ip.usernameCount),
    fmt(ip.passwordCount),
  ])

  return (
    <>
      <SectionHeader title={t("reports.section.credentials")} />
      <View style={s.kpiRow}>
        <KpiCard label="Attempts" value={fmt(credentialSummary.totalAttempts)} meta={`${fmt(credentialSummary.failedAttempts)} failed`} />
        <KpiCard label="Success Rate" value={pct(credentialSummary.successRate * 100)} meta={`${fmt(credentialSummary.successfulAttempts)} successful`} />
        <KpiCard label="Unique Pairs" value={fmt(credentialSummary.uniqueCredentialPairs)} meta={`${fmt(credentialSummary.repeatedCredentialPairs)} repeated`} />
        <KpiCard label="Spray Patterns" value={fmt(credentialSummary.sprayPasswords)} meta={`${fmt(credentialSummary.targetedUsernames)} targeted usernames`} />
      </View>
      {credentialRows.length > 0 ? (
        <SimpleTable headers={[t("reports.creds.username"), t("reports.creds.password"), t("reports.creds.attempts"), t("reports.creds.successes"), "Success Rate"]} rows={credentialRows} widths={["23%", "23%", "18%", "18%", "18%"]} />
      ) : (
        <Text style={s.noData}>{t("reports.noActivity")}</Text>
      )}
      {diversifiedRows.length > 0 ? (
        <SimpleTable headers={["Attacker IP", "Attempts", "Credential Pairs", "Usernames", "Passwords"]} rows={diversifiedRows} widths={["30%", "16%", "18%", "18%", "18%"]} />
      ) : null}
    </>
  )
}
