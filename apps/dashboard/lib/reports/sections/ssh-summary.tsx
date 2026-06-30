import React from "react"
import { Text, View } from "@react-pdf/renderer"
import type { ClientReportData } from "../types"
import { fmt } from "../shared/format"
import { C, RankedBars, RatioBar, s, SectionHeader, SimpleTable, type T } from "../shared/pdf-ui"

export function SshSummarySection({ data, t }: { data: ClientReportData; t: T }) {
  const { botRatio, insights, sensors } = data
  const hasSshSensor = sensors.some((profile) => profile.sensor.protocol === "ssh")
  if (!hasSshSensor) return null

  const depthBarItems = insights.successfulDepth.buckets.map((bucket) => ({
    label: `${bucket.bucket} commands`,
    value: bucket.sessions,
    pct: insights.funnel.loginSuccess > 0 ? (bucket.sessions / insights.funnel.loginSuccess) * 100 : 0,
  }))

  const commandPatternRows = insights.commandPatterns.slice(0, 5).map((pattern) => [
    pattern.sequence.slice(0, 58),
    fmt(pattern.sessions),
    fmt(pattern.uniqueIps),
  ])

  const recurringRows = insights.recurringIps.slice(0, 8).map((ip) => [
    ip.srcIp,
    fmt(ip.totalSessions),
    fmt(ip.credentialCount),
    fmt(ip.successfulSessions),
    ip.returnAfterMinutes == null ? "-" : `${fmt(ip.returnAfterMinutes)} min`,
  ])

  return (
    <>
      <SectionHeader title={t("reports.section.classification")} />
      <View style={s.panel}>
        <RatioBar label={t("reports.chart.bot")} value={botRatio.bot} total={botRatio.total} color={C.red} meta="Automated session profile" />
        <RatioBar label={t("reports.chart.human")} value={botRatio.human} total={botRatio.total} color={C.green} meta="Interactive operator profile" />
        <RatioBar label={t("reports.chart.unknown")} value={botRatio.unknown} total={botRatio.total} color={C.gray} meta="Insufficient classification signals" />
      </View>

      <SectionHeader title={t("reports.section.reconnaissance")} />
      <View style={s.twoCol}>
        <View style={s.col}>
          <View style={s.panel}>
            <Text style={s.panelTitle}>Attack Funnel</Text>
            <RatioBar label={t("reports.funnel.connections")} value={insights.funnel.connections} total={insights.funnel.connections} color={C.indigo} />
            <RatioBar label={t("reports.funnel.authAttempts")} value={insights.funnel.authAttempts} total={insights.funnel.connections} color={C.blue} meta="Conversion from connection to auth" />
            <RatioBar label={t("reports.funnel.loginSuccess")} value={insights.funnel.loginSuccess} total={insights.funnel.connections} color={C.green} meta="Sessions that cleared authentication" />
            <RatioBar label={t("reports.funnel.commands")} value={insights.funnel.commands} total={insights.funnel.connections} color={C.amber} meta="Sessions that executed commands" />
            <RatioBar label={t("reports.funnel.compromise")} value={insights.funnel.highSignalCompromise} total={insights.funnel.connections} color={C.red} meta="High-signal post-login behavior" />
          </View>
        </View>
        <View style={s.col}>
          <View style={s.panel}>
            <Text style={s.panelTitle}>Command Depth After Login</Text>
            {depthBarItems.length > 0 ? <RankedBars items={depthBarItems} color={C.indigo} /> : <Text style={s.noData}>{t("reports.noActivity")}</Text>}
            <Text style={s.bodyText}>Average commands per successful session: {fmt(insights.successfulDepth.averageCommands)}. Maximum observed depth: {fmt(insights.successfulDepth.maxCommands)} commands. Interactive sessions (20+ commands): {fmt(insights.successfulDepth.interactiveSessions)}.</Text>
          </View>
        </View>
      </View>

      {commandPatternRows.length > 0 ? <SimpleTable headers={["Command Sequence", "Sessions", "Unique IPs"]} rows={commandPatternRows} widths={["64%", "18%", "18%"]} /> : null}

      {recurringRows.length > 0 ? (
        <>
          <SectionHeader title={t("reports.creds.recurringIps")} />
          <SimpleTable headers={["IP", "Sessions", "Creds", "Success", "Return Delay"]} rows={recurringRows} widths={["30%", "16%", "16%", "16%", "22%"]} />
        </>
      ) : null}
    </>
  )
}
