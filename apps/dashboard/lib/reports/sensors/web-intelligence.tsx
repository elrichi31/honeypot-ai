import React from "react"
import { Text, View } from "@react-pdf/renderer"
import type { ClientReportData } from "../types"
import { fmt, rate } from "../shared/format"
import { C, KpiCard, RankedBars, s, SimpleTable } from "../shared/pdf-ui"

export function WebSensorIntelligence({ profile }: { profile: ClientReportData["sensors"][number] }) {
  const web = profile.web
  if (!web) return null

  const attackTypeItems = web.topAttackTypes.map((item) => ({
    label: item.label,
    value: item.count,
    pct: web.hits > 0 ? (item.count / web.hits) * 100 : 0,
  }))

  const pathRows = web.topPaths.map((item) => [item.label, fmt(item.count), rate(item.count, web.hits)])
  const methodRows = web.topMethods.map((item) => [item.label, fmt(item.count), rate(item.count, web.hits)])
  const userAgentRows = web.topUserAgents.map((item) => [item.label, fmt(item.count)])
  const canaryRows = web.topCanaryTokens.map((item) => [item.label, fmt(item.count), rate(item.count, Math.max(web.canaryHits, 1))])
  const sessionRows = web.topSessions.map((session) => [
    session.label.length > 22 ? `${session.label.slice(0, 19)}...` : session.label,
    fmt(session.hits),
    fmt(session.ipCount),
    fmt(session.chainHits),
    fmt(session.canaryHits),
  ])

  return (
    <>
      <Text style={[s.panelTitle, { marginTop: 6 }]}>Web Intelligence</Text>
      <View style={s.kpiRow}>
        <KpiCard label="HTTP Hits" value={fmt(web.hits)} meta={`${fmt(profile.uniqueIps)} unique IPs`} />
        <KpiCard label="Observed Sessions" value={fmt(web.sessionCount)} meta={`${fmt(web.fingerprintedSessions)} fingerprinted`} />
        <KpiCard label="Unique Paths" value={fmt(web.uniquePaths)} meta={`${fmt(web.attackTypeCount)} attack types`} />
        <KpiCard label="High-Signal Web" value={fmt(web.canaryHits + web.chainHits)} meta={`${fmt(web.canaryHits)} canary + ${fmt(web.chainHits)} chain`} />
      </View>

      <View style={s.twoCol}>
        <View style={s.col}>
          {attackTypeItems.length > 0 ? <RankedBars items={attackTypeItems} color={C.indigo} /> : <Text style={s.noData}>No web attack-type breakdown available for this sensor.</Text>}
        </View>
        <View style={s.col}>
          <View style={s.panel}>
            <Text style={s.panelTitle}>Interpretation</Text>
            <Text style={s.bullet}>- Canary hits: {fmt(web.canaryHits)} requests touched bait content or monitoring tokens.</Text>
            <Text style={s.bullet}>- Chain hits: {fmt(web.chainHits)} requests were part of multi-step pathing instead of one-off probes.</Text>
            <Text style={s.bullet}>- Multi-IP sessions: {fmt(web.multiIpSessions)} fingerprints rotated source IPs during the same activity pattern.</Text>
          </View>
        </View>
      </View>

      <View style={s.twoCol}>
        <View style={s.col}>
          {pathRows.length > 0 ? <SimpleTable headers={["Top Path", "Hits", "Share"]} rows={pathRows} widths={["58%", "20%", "22%"]} /> : null}
        </View>
        <View style={s.col}>
          {methodRows.length > 0 ? <SimpleTable headers={["HTTP Method", "Hits", "Share"]} rows={methodRows} widths={["46%", "24%", "30%"]} /> : null}
        </View>
      </View>

      {sessionRows.length > 0 ? (
        <>
          <Text style={[s.panelTitle, { marginTop: 6 }]}>Dominant Web Sessions</Text>
          <SimpleTable headers={["Fingerprint / IP", "Hits", "IPs", "Chain", "Canary"]} rows={sessionRows} widths={["42%", "14%", "12%", "16%", "16%"]} />
        </>
      ) : null}

      <View style={s.twoCol}>
        <View style={s.col}>
          {userAgentRows.length > 0 ? <SimpleTable headers={["User Agent", "Hits"]} rows={userAgentRows} widths={["78%", "22%"]} /> : null}
        </View>
        <View style={s.col}>
          {canaryRows.length > 0 ? <SimpleTable headers={["Canary Token", "Hits", "Share"]} rows={canaryRows} widths={["48%", "20%", "32%"]} /> : null}
        </View>
      </View>
    </>
  )
}
