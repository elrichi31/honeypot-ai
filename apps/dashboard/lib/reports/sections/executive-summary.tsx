import React from "react"
import { Text, View } from "@react-pdf/renderer"
import type { ClientReportData } from "../types"
import { deltaStr, fmt, pct, sumBucket } from "../shared/format"
import { C, Footer, KpiCard, RankedBars, s, SectionHeader, SimpleTable, TimelineChart, type T } from "../shared/pdf-ui"

export function ExecutiveSummaryPage({ data, t }: { data: ClientReportData; t: T }) {
  const { meta, kpiTrends, botRatio, mitre, overview, timeline, geo, sensors } = data

  const generatedDate = new Date(meta.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const timelineItems = timeline.buckets.map((bucket) => ({
    label: String(bucket.label ?? "").slice(0, 5),
    value: sumBucket(bucket),
  }))
  const peakTimeline = timelineItems.reduce((peak, item) => item.value > peak.value ? item : peak, { label: "-", value: 0 })
  const totalTimeline = timelineItems.reduce((sum, item) => sum + item.value, 0)
  const avgTimeline = timelineItems.length > 0 ? Math.round(totalTimeline / timelineItems.length) : 0

  const sourceRows = [
    { label: "SSH", value: overview.ssh.sessions, meta: `${fmt(overview.ssh.uniqueIps)} unique IPs` },
    { label: "Web", value: overview.web.hits, meta: `${fmt(overview.web.uniqueIps)} unique IPs` },
    ...overview.protocols.slice(0, 5).map((protocol) => ({
      label: protocol.protocol.toUpperCase(),
      value: protocol.count,
      meta: `${fmt(protocol.uniqueIps)} IPs - ${fmt(protocol.authAttempts)} auth`,
    })),
  ].filter((row) => row.value > 0)
  const totalSourceVolume = sourceRows.reduce((sum, row) => sum + row.value, 0)
  const sourceBarItems = sourceRows.map((row) => ({
    ...row,
    pct: totalSourceVolume > 0 ? (row.value / totalSourceVolume) * 100 : 0,
  }))

  const geoRows = geo.slice(0, 10).map((entry) => ([
    `${entry.country} (${entry.countryCode})`,
    fmt(entry.count),
    pct(entry.share),
    fmt(entry.successCount),
  ]))
  const geoBarItems = geo.slice(0, 8).map((entry) => ({
    label: `${entry.country} (${entry.countryCode})`,
    value: entry.count,
    pct: entry.share,
    meta: `${fmt(entry.successCount)} successful login IPs`,
  }))

  const findings = [
    `${fmt(kpiTrends.events.current)} total events were recorded, with ${fmt(kpiTrends.uniqueIps.current)} unique attacker IPs active in the latest reporting window.`,
    `${sourceRows[0]?.label ?? "SSH"} was the dominant source of activity with ${fmt(sourceRows[0]?.value ?? 0)} events, representing ${totalSourceVolume > 0 ? pct(((sourceRows[0]?.value ?? 0) / totalSourceVolume) * 100) : "0.0%"} of observed volume.`,
    `Peak activity occurred in bucket ${peakTimeline.label} with ${fmt(peakTimeline.value)} events, versus an average of ${fmt(avgTimeline)} per bucket.`,
    `${fmt(data.credentialSummary.totalAttempts)} credential attempts were seen in the selected period with a ${pct(data.credentialSummary.successRate * 100)} success rate.`,
  ]

  const fleetRows = sensors.slice(0, 6).map((profile) => ({
    label: `${profile.sensor.name} (${profile.sensor.sensorId})`,
    value: profile.sensor.eventsTotal,
    pct: profile.eventShare,
    meta: `${profile.sensor.protocol.toUpperCase()} - ${profile.sensor.online ? "online" : "offline"} - ${fmt(profile.uniqueIps)} unique IPs`,
  }))

  const hasSshSensor = sensors.some((profile) => profile.sensor.protocol === "ssh")

  return (
    <>
      <View style={s.cover}>
        <Text style={s.coverMeta}>Security Report - HoneyTrap Platform</Text>
        <Text style={s.coverTitle}>{meta.clientName}</Text>
        <Text style={s.coverSub}>{meta.periodLabel}</Text>
        <Text style={s.coverMeta}>{t("reports.footer.generated")}: {generatedDate}</Text>
        <View style={s.coverKpiRow}>
          {[
            { value: fmt(kpiTrends.events.current), label: t("reports.kpi.events") },
            { value: fmt(kpiTrends.uniqueIps.current), label: t("reports.kpi.uniqueIps") },
            { value: pct(botRatio.botPct), label: t("reports.kpi.botPct") },
            { value: fmt(mitre.tactics.length), label: t("reports.kpi.mitreTactics") },
          ].map((item, index) => (
            <View key={index} style={s.coverKpi}>
              <Text style={s.coverKpiVal}>{item.value}</Text>
              <Text style={s.coverKpiLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <SectionHeader title={t("reports.section.executive")} />
      <View style={s.kpiRow}>
        <KpiCard label={t("reports.kpi.events")} value={fmt(kpiTrends.events.current)} delta={deltaStr(kpiTrends.events.deltaPct)} meta={`Prev: ${fmt(kpiTrends.events.previous)}`} />
        {hasSshSensor ? (
          <KpiCard label={t("reports.kpi.sessions")} value={fmt(kpiTrends.sshSessions.current)} delta={deltaStr(kpiTrends.sshSessions.deltaPct)} meta={`${fmt(overview.ssh.successfulLogins)} successful logins`} />
        ) : (
          <KpiCard label="Assigned Sensors" value={fmt(sensors.length)} meta={`${fmt(sensors.filter((profile) => profile.sensor.online).length)} online`} />
        )}
        <KpiCard label={t("reports.kpi.webHits")} value={fmt(kpiTrends.webHits.current)} delta={deltaStr(kpiTrends.webHits.deltaPct)} meta={overview.web.topAttackType ? `Top type: ${overview.web.topAttackType}` : undefined} />
        <KpiCard label={t("reports.kpi.uniqueIps")} value={fmt(kpiTrends.uniqueIps.current)} delta={deltaStr(kpiTrends.uniqueIps.deltaPct)} meta={`${fmt(overview.totals.activeSources)} active sources`} />
      </View>

      <View style={s.panel}>
        <Text style={s.panelTitle}>Key Findings</Text>
        {findings.map((finding, index) => (
          <Text key={index} style={s.bullet}>- {finding}</Text>
        ))}
      </View>

      <SectionHeader title="Attack Surface Mix" />
      {sourceBarItems.length > 0 ? <RankedBars items={sourceBarItems} color={C.blue} /> : <Text style={s.noData}>{t("reports.noActivity")}</Text>}

      <SectionHeader title={t("reports.section.timeline")} />
      {timelineItems.length > 0 ? (
        <>
          <TimelineChart items={timelineItems} />
          <View style={s.kpiRow}>
            <KpiCard label="Peak Bucket" value={fmt(peakTimeline.value)} meta={peakTimeline.label} />
            <KpiCard label="Average / Bucket" value={fmt(avgTimeline)} meta={`${fmt(totalTimeline)} total`} />
            <KpiCard label="Observed Buckets" value={fmt(timelineItems.length)} meta="Chronological activity series" />
          </View>
        </>
      ) : <Text style={s.noData}>{t("reports.noActivity")}</Text>}

      <SectionHeader title={t("reports.section.geo")} />
      {geoBarItems.length > 0 ? (
        <>
          <RankedBars items={geoBarItems} color={C.purple} />
          <SimpleTable headers={["Country", "Unique IPs", "Share", "Successful IPs"]} rows={geoRows} widths={["42%", "18%", "18%", "22%"]} />
        </>
      ) : <Text style={s.noData}>{t("reports.noActivity")}</Text>}

      {fleetRows.length > 0 ? (
        <>
          <SectionHeader title="Assigned Sensors" />
          <RankedBars items={fleetRows} color={C.indigo} />
        </>
      ) : null}

      <Footer data={data} t={t} />
    </>
  )
}
