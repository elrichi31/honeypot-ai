import React from "react"
import { Text, View } from "@react-pdf/renderer"
import type { ClientReportData } from "../types"
import { formatBytes, fmt, protocolLabel, rate, sensorNarrative, truncPassword } from "../shared/format"
import { KpiCard, s, SectionHeader, SimpleTable, type T } from "../shared/pdf-ui"
import { ProtocolIntelligence } from "./protocol-intelligence"
import { WebSensorIntelligence } from "./web-intelligence"

export function SensorPage({ profile, t }: { profile: ClientReportData["sensors"][number]; t: T }) {
  const topAttackerRows = profile.topAttackers.map((item) => [item.srcIp, fmt(item.count)])
  const signalRows = profile.topSignals.map((item) => [item.label, fmt(item.count)])
  const sensorCredentialRows = profile.topCredentials.map((item) => [
    item.username ?? "-",
    truncPassword(item.password),
    fmt(item.attempts),
    rate(item.successCount, item.attempts),
  ])
  const sensorMalwareRows = profile.recentMalware.map((item) => [
    item.fileType,
    formatBytes(item.size),
    item.source?.toUpperCase() ?? "-",
    item.sourceName ?? item.sourceUrl ?? item.md5,
    item.srcIp ?? "-",
  ])

  return (
    <>
      <SectionHeader title={`${protocolLabel(profile.sensor.protocol)} - ${profile.sensor.name}`} />
      <Text style={[s.bodyText, { marginBottom: 4 }]}>{sensorNarrative(profile.sensor.protocol)}</Text>
      <Text style={[s.bodyText, { marginBottom: 6 }]}>
        {profile.sensor.sensorId} | IP {profile.sensor.ip} | Ports {profile.sensor.ports.length > 0 ? profile.sensor.ports.join(", ") : "-"} | Version {profile.sensor.version || "-"} | Status {profile.sensor.online ? "online" : "offline"} | Last seen {new Date(profile.sensor.lastSeen).toLocaleString("en-US")}
      </Text>

      <View style={s.kpiRow}>
        <KpiCard label="Events" value={fmt(profile.sensor.eventsTotal)} meta={`${profile.eventShare.toFixed(1)}% of client volume`} />
        <KpiCard label="Unique IPs" value={fmt(profile.uniqueIps)} />
        <KpiCard label="Auth Attempts" value={fmt(profile.authAttempts)} meta={`${fmt(profile.successCount)} successful`} />
        <KpiCard label="Commands" value={fmt(profile.commandCount)} meta={`${fmt(profile.malwareCount)} malware samples`} />
      </View>

      <View style={s.twoCol}>
        <View style={s.col}>
          {topAttackerRows.length > 0 ? <SimpleTable headers={["Top Attacker", "Hits"]} rows={topAttackerRows} widths={["74%", "26%"]} /> : <Text style={s.noData}>No attacker ranking available for this sensor.</Text>}
        </View>
        <View style={s.col}>
          {signalRows.length > 0 ? <SimpleTable headers={["Primary Signals", "Count"]} rows={signalRows} widths={["74%", "26%"]} /> : <Text style={s.noData}>No signal breakdown available for this sensor.</Text>}
        </View>
      </View>

      <WebSensorIntelligence profile={profile} />
      <ProtocolIntelligence profile={profile} />

      {sensorCredentialRows.length > 0 ? (
        <>
          <Text style={[s.panelTitle, { marginTop: 6 }]}>Credential Attempts</Text>
          <SimpleTable headers={["Username", "Password", "Attempts", "Success Rate"]} rows={sensorCredentialRows} widths={["26%", "26%", "22%", "26%"]} />
        </>
      ) : null}

      {sensorMalwareRows.length > 0 ? (
        <>
          <Text style={[s.panelTitle, { marginTop: 6 }]}>Captured Malware</Text>
          <SimpleTable
            headers={["Type", "Size", "Source", "Artifact / Path", "Source IP"]}
            rows={sensorMalwareRows}
            widths={["18%", "14%", "14%", "34%", "20%"]}
          />
        </>
      ) : null}
    </>
  )
}
