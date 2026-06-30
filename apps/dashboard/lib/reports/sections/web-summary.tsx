import React from "react"
import { Text, View } from "@react-pdf/renderer"
import type { ClientReportData } from "../types"
import { aggregateLabelCounts, fmt, rate } from "../shared/format"
import { C, KpiCard, RankedBars, s, SectionHeader, SimpleTable } from "../shared/pdf-ui"

export function WebSummarySection({ data, title }: { data: ClientReportData; title: string }) {
  const { overview, sensors } = data
  const webProfiles = sensors.filter((profile) => profile.web)
  const webTotals = webProfiles.reduce((acc, profile) => {
    const web = profile.web!
    acc.hits += web.hits
    acc.uniquePaths += web.uniquePaths
    acc.sessionCount += web.sessionCount
    acc.canaryHits += web.canaryHits
    acc.chainHits += web.chainHits
    acc.multiIpSessions += web.multiIpSessions
    return acc
  }, { hits: 0, uniquePaths: 0, sessionCount: 0, canaryHits: 0, chainHits: 0, multiIpSessions: 0 })

  const webAttackBarItems = aggregateLabelCounts(webProfiles.map((profile) => profile.web?.topAttackTypes ?? []), 6)
    .map((item) => ({
      label: item.label,
      value: item.count,
      pct: webTotals.hits > 0 ? (item.count / webTotals.hits) * 100 : 0,
    }))
  const webPathRows = aggregateLabelCounts(webProfiles.map((profile) => profile.web?.topPaths ?? []), 6)
    .map((item) => [item.label, fmt(item.count), rate(item.count, Math.max(webTotals.hits, 1))])
  const webMethodRows = aggregateLabelCounts(webProfiles.map((profile) => profile.web?.topMethods ?? []), 5)
    .map((item) => [item.label, fmt(item.count), rate(item.count, Math.max(webTotals.hits, 1))])

  if (!(webProfiles.length > 0 && (overview.web.hits ?? 0) > 0)) return null

  return (
    <>
      <SectionHeader title={title} />
      <View style={s.kpiRow}>
        <KpiCard label="Total Hits" value={fmt(overview.web.hits)} meta={`${fmt(overview.web.uniqueIps)} unique IPs`} />
        <KpiCard label="Observed Sessions" value={fmt(webTotals.sessionCount)} meta={`${fmt(webTotals.multiIpSessions)} multi-IP fingerprints`} />
        <KpiCard label="Targeted Paths" value={fmt(webTotals.uniquePaths)} meta={overview.web.topAttackType ? `Top type: ${overview.web.topAttackType}` : undefined} />
        <KpiCard label="High-Signal Requests" value={fmt(webTotals.canaryHits + webTotals.chainHits)} meta={`${fmt(webTotals.canaryHits)} canary + ${fmt(webTotals.chainHits)} chain`} />
      </View>
      <View style={s.twoCol}>
        <View style={s.col}>
          {webAttackBarItems.length > 0 ? <RankedBars items={webAttackBarItems} color={C.indigo} /> : <Text style={s.noData}>No activity recorded for this period.</Text>}
        </View>
        <View style={s.col}>
          <View style={s.panel}>
            <Text style={s.panelTitle}>Web Interpretation</Text>
            <Text style={s.bullet}>- Attack-type concentration highlights whether traffic is narrow automated probing or varied exploitation.</Text>
            <Text style={s.bullet}>- Canary and chain counts surface adversaries that touched bait content or navigated through multiple staged endpoints.</Text>
            <Text style={s.bullet}>- Session totals are grouped by fingerprint when available, so repeated automation is not overstated as isolated one-hit scans.</Text>
          </View>
        </View>
      </View>
      <View style={s.twoCol}>
        <View style={s.col}>
          {webPathRows.length > 0 ? <SimpleTable headers={["Target Path", "Hits", "Share"]} rows={webPathRows} widths={["58%", "20%", "22%"]} /> : null}
        </View>
        <View style={s.col}>
          {webMethodRows.length > 0 ? <SimpleTable headers={["HTTP Method", "Hits", "Share"]} rows={webMethodRows} widths={["46%", "24%", "30%"]} /> : null}
        </View>
      </View>
    </>
  )
}
