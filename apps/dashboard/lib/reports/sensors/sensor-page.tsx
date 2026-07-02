import React from "react"
import { Text, View } from "@react-pdf/renderer"
import type { ClientReportData } from "../types"
import { fmt, protocolLabel, rate, truncPassword } from "../shared/format"

function trunc(str: string, max = 18): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str
}
import { C, KpiCard, s, SectionHeader, SimpleTable, type T } from "../shared/pdf-ui"
import { ActivityTimeline, BarChart, HourHeatmap } from "../shared/pdf-charts"
import { ProtocolIntelligence } from "./protocol-intelligence"
import { WebSensorIntelligence } from "./web-intelligence"

export function SensorPage({ profile, t }: { profile: ClientReportData["sensors"][number]; t: T }) {
  const useEnriched = profile.topEnrichedAttackers.length > 0
  const topAttackerRows = useEnriched
    ? profile.topEnrichedAttackers.slice(0, 5).map((item) => [
        item.ip,
        item.country,
        trunc(item.org, 18),
        item.abuseScore > 0 ? String(item.abuseScore) : "-",
        fmt(item.hits),
      ])
    : profile.topAttackers.slice(0, 5).map((item) => [item.srcIp, fmt(item.count)])
  const sensorCredentialRows = profile.topCredentials.slice(0, 4).map((item) => [
    item.username ?? "-",
    truncPassword(item.password),
    fmt(item.attempts),
    rate(item.successCount, item.attempts),
  ])
  const sensorMalwareRows = profile.recentMalware.slice(0, 3).map((item) => [
    item.fileType,
    item.source?.toUpperCase() ?? "-",
    item.md5?.slice(0, 16) ?? (item.sourceUrl ?? "-"),
    item.srcIp ?? "-",
  ])

  return (
    <>
      {/* ── Header ── */}
      <SectionHeader title={`${protocolLabel(profile.sensor.protocol)} — ${profile.sensor.name}`} />
      <Text style={[{ fontSize: 7, color: C.textMuted, marginBottom: 5 }]}>
        {profile.sensor.sensorId} · IP {profile.sensor.ip} · Ports {profile.sensor.ports.length > 0 ? profile.sensor.ports.join(", ") : "-"} · {profile.sensor.online ? "Online" : "Offline"} · Last seen {new Date(profile.sensor.lastSeen).toLocaleDateString("en-US")}
      </Text>

      {/* ── KPI row ── */}
      <View style={[s.kpiRow, { marginBottom: 6 }]}>
        <KpiCard label="Events" value={fmt(profile.sensor.eventsTotal)} meta={`${profile.eventShare.toFixed(1)}% of client`} />
        <KpiCard label="Unique IPs" value={fmt(profile.uniqueIps)} />
        <KpiCard label="Auth Attempts" value={fmt(profile.authAttempts)} meta={`${fmt(profile.successCount)} ok`} />
        <KpiCard label="Commands" value={fmt(profile.commandCount)} meta={`${fmt(profile.malwareCount)} malware`} />
      </View>

      {/* ── Row 1: Timeline + Heatmap side by side ── */}
      <View style={[s.twoCol, { marginBottom: 6 }]}>
        <View style={{ flex: 2 }}>
          {profile.dailyActivity.length >= 2 && (
            <ActivityTimeline data={profile.dailyActivity} width={340} height={64} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          {profile.hourlyActivity.length > 0 && (
            <HourHeatmap data={profile.hourlyActivity} width={178} />
          )}
        </View>
      </View>

      {/* ── Row 2: Top Attackers + Event Breakdown ── */}
      <View style={[s.twoCol, { marginBottom: 4 }]}>
        <View style={s.col}>
          {topAttackerRows.length > 0 && (
            <>
              <Text style={[s.panelTitle, { marginBottom: 3 }]}>Top Attacker IPs</Text>
              {useEnriched ? (
                <SimpleTable
                  headers={["IP", "CC", "ISP / Org", "Abuse", "Hits"]}
                  rows={topAttackerRows}
                  widths={["26%", "8%", "34%", "12%", "20%"]}
                />
              ) : (
                <SimpleTable
                  headers={["IP", "Hits"]}
                  rows={topAttackerRows}
                  widths={["74%", "26%"]}
                />
              )}
            </>
          )}
        </View>
        <View style={s.col}>
          {profile.eventBreakdown.length > 0 && (
            <BarChart
              data={profile.eventBreakdown}
              width={255}
              height={80}
              title="Event Type Breakdown"
              maxBars={5}
            />
          )}
        </View>
      </View>

      {/* ── Protocol Intelligence (compacto) ── */}
      <ProtocolIntelligence profile={profile} />

      {/* ── Web Intelligence (si aplica) ── */}
      <WebSensorIntelligence profile={profile} />

      {/* ── Credentials + Malware ── */}
      {(sensorCredentialRows.length > 0 || sensorMalwareRows.length > 0) && (
        <View style={[s.twoCol, { marginTop: 4 }]}>
          <View style={s.col}>
            {sensorCredentialRows.length > 0 && (
              <>
                <Text style={[s.panelTitle, { marginBottom: 3 }]}>Credential Attempts</Text>
                <SimpleTable
                  headers={["User", "Pass", "Tries", "Hit%"]}
                  rows={sensorCredentialRows}
                  widths={["28%", "28%", "20%", "24%"]}
                />
              </>
            )}
          </View>
          <View style={s.col}>
            {sensorMalwareRows.length > 0 && (
              <>
                <Text style={[s.panelTitle, { marginBottom: 3 }]}>Captured Malware</Text>
                <SimpleTable
                  headers={["Type", "Src", "Hash / Path", "IP"]}
                  rows={sensorMalwareRows}
                  widths={["14%", "12%", "44%", "30%"]}
                />
              </>
            )}
          </View>
        </View>
      )}
    </>
  )
}
