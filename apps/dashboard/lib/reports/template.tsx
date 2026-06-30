// Server-only: React-PDF document component.
import React from "react"
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer"
import type { ClientReportData } from "./types"
import type { TranslationKey } from "@/lib/i18n/dictionaries"

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string

const C = {
  indigo: "#6366f1",
  purple: "#8b5cf6",
  blue: "#2563eb",
  red: "#ef4444",
  green: "#22c55e",
  amber: "#f59e0b",
  gray: "#9ca3af",
  grayLight: "#f3f4f6",
  graySoft: "#f8fafc",
  grayBorder: "#e5e7eb",
  textDark: "#111827",
  textMid: "#374151",
  textMuted: "#6b7280",
  white: "#ffffff",
  coverBg: "#1e1b4b",
}

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.textDark,
    paddingTop: 30,
    paddingBottom: 30,
    paddingHorizontal: 30,
    backgroundColor: C.white,
  },
  cover: { backgroundColor: C.coverBg, borderRadius: 10, padding: 24, marginBottom: 16 },
  coverMeta: { fontSize: 8, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: 0.8 },
  coverTitle: { fontSize: 24, fontFamily: "Helvetica-Bold", color: C.white, marginTop: 6 },
  coverSub: { fontSize: 11, color: "#c7d2fe", marginTop: 2 },
  coverKpiRow: { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" },
  coverKpi: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 6, padding: 9, minWidth: 92 },
  coverKpiVal: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.white },
  coverKpiLabel: { fontSize: 7, color: "#c7d2fe", marginTop: 2, textTransform: "uppercase" },

  sectionHeader: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 7 },
  sectionBar: { width: 3, height: 14, backgroundColor: C.indigo, borderRadius: 2, marginRight: 7 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8 },

  twoCol: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },
  panel: { backgroundColor: C.graySoft, borderRadius: 8, border: `1 solid ${C.grayBorder}`, padding: 10, marginBottom: 8 },
  panelTitle: { fontSize: 7, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  bodyText: { fontSize: 8.5, color: C.textMid, lineHeight: 1.4 },
  bullet: { fontSize: 8.5, color: C.textMid, marginBottom: 4, lineHeight: 1.35 },

  kpiRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  kpiCard: { backgroundColor: C.grayLight, borderRadius: 6, padding: 9, minWidth: 100, flex: 1 },
  kpiLabel: { fontSize: 7, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.45, marginBottom: 3 },
  kpiValue: { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.textDark },
  kpiDeltaPos: { fontSize: 8, color: C.green, marginTop: 2 },
  kpiDeltaNeg: { fontSize: 8, color: C.red, marginTop: 2 },
  kpiMeta: { fontSize: 7.5, color: C.textMuted, marginTop: 2 },

  table: { width: "100%", borderRadius: 5, overflow: "hidden", border: `1 solid ${C.grayBorder}`, marginBottom: 8 },
  tableHeader: { flexDirection: "row", backgroundColor: C.grayLight, borderBottom: `1 solid ${C.grayBorder}` },
  tableRow: { flexDirection: "row", borderBottom: `1 solid ${C.grayLight}` },
  tableRowAlt: { flexDirection: "row", borderBottom: `1 solid ${C.grayLight}`, backgroundColor: "#fafafa" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4, padding: "5 7" },
  td: { fontSize: 8, color: C.textMid, padding: "5 7" },

  rankedRow: { marginBottom: 7 },
  rankedTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 2 },
  rankedLabel: { fontSize: 8, color: C.textDark, width: "58%" },
  rankedValue: { fontSize: 8, color: C.textMid, width: "18%", textAlign: "right" },
  rankedPct: { fontSize: 8, color: C.textMuted, width: "14%", textAlign: "right" },
  rankedTrack: { height: 8, borderRadius: 4, backgroundColor: C.grayBorder, overflow: "hidden" },
  rankedFill: { height: 8, borderRadius: 4 },
  rankedMeta: { fontSize: 7.5, color: C.textMuted, marginTop: 2 },

  timelineWrap: { marginBottom: 8 },
  timelineRow: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 86 },
  timelineCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  timelineValue: { fontSize: 6, color: C.textMuted, marginBottom: 2 },
  timelineBarWrap: { width: "100%", height: 54, justifyContent: "flex-end", backgroundColor: C.grayLight, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  timelineBar: { width: "100%", backgroundColor: C.indigo, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
  timelineLabel: { fontSize: 6, color: C.textMuted, marginTop: 3, textAlign: "center" },

  ratioRow: { marginBottom: 6 },
  ratioTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  ratioLabel: { fontSize: 8, color: C.textMid },
  ratioValue: { fontSize: 8, color: C.textMid },
  ratioTrack: { height: 10, borderRadius: 4, backgroundColor: C.grayBorder, overflow: "hidden" },
  ratioFill: { height: 10, borderRadius: 4 },

  footer: { borderTop: `1 solid ${C.grayBorder}`, paddingTop: 8, flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  footerText: { fontSize: 7, color: C.gray },
  noData: { fontSize: 8.5, color: C.textMuted, marginBottom: 8 },
})

function fmt(n: number | null | undefined): string {
  if (n == null) return "-"
  return n.toLocaleString("en-US")
}

// Long no-whitespace values (e.g. hashed passwords) do not wrap in react-pdf and
// overflow into the next column, so cap them to keep table cells aligned.
function truncPassword(value: string | null | undefined): string {
  if (!value) return "-"
  return value.length > 22 ? `${value.slice(0, 21)}…` : value
}

function pct(n: number | null | undefined): string {
  if (n == null) return "-"
  return `${n.toFixed(1)}%`
}

function deltaStr(d: number | null | undefined): string | null {
  if (d == null) return null
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`
}

function rate(value: number, total: number): string {
  if (total <= 0) return "0.0%"
  return `${((value / total) * 100).toFixed(1)}%`
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function protocolLabel(protocol: string): string {
  const labels: Record<string, string> = {
    ssh: "SSH Honeypot",
    smb: "SMB Honeypot",
    mysql: "MySQL Honeypot",
    ftp: "FTP Honeypot",
    http: "Web Honeypot",
    "port-scan": "Port Honeypot",
    dionaea: "Dionaea Multi-Protocol Honeypot",
    mqtt: "MQTT Honeypot",
    mssql: "MSSQL Honeypot",
    tftp: "TFTP Honeypot",
    rpc: "RPC Honeypot",
  }
  return labels[protocol] ?? protocol.toUpperCase()
}

function sensorNarrative(protocol: string): string {
  const copy: Record<string, string> = {
    ssh: "Interactive shell telemetry with authentication attempts, command execution depth, and post-login behavior.",
    smb: "Windows file-sharing exposure focused on share access, credential use, file transfer, and lateral movement signals.",
    mysql: "Database probe telemetry covering login attempts, targeted usernames, password reuse, and command-style interaction.",
    ftp: "File-transfer attack surface showing login attempts, command usage, and staged upload or download behavior.",
    http: "Web attack traffic across paths, methods, attack types, and recon or exploitation sequences.",
    "port-scan": "Decoy service exposure that highlights scanned ports, inferred services, and broad reconnaissance behavior.",
    dionaea: "Multi-protocol exploitation visibility across common worm, malware-delivery, and service-probing paths.",
    mqtt: "IoT broker abuse telemetry with topic interaction, broker access attempts, and bot-style automation patterns.",
    mssql: "SQL Server access attempts with credential abuse, service targeting, and command execution probes.",
    tftp: "File delivery and retrieval attempts often associated with automated staging or firmware distribution.",
    rpc: "RPC and endpoint-mapper probing that can indicate Windows discovery or exploit preparation.",
  }
  return copy[protocol] ?? "Sensor-specific telemetry for this exposed service."
}

function sumBucket(bucket: Record<string, number | string>): number {
  return Object.entries(bucket).reduce((sum, [key, value]) => {
    if (key === "label") return sum
    return typeof value === "number" ? sum + value : sum
  }, 0)
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionBar} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  )
}

function KpiCard({ label, value, delta, meta }: { label: string; value: string; delta?: string | null; meta?: string }) {
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {delta ? <Text style={delta.startsWith("-") ? s.kpiDeltaNeg : s.kpiDeltaPos}>{delta}</Text> : null}
      {meta ? <Text style={s.kpiMeta}>{meta}</Text> : null}
    </View>
  )
}

function SimpleTable({
  headers,
  rows,
  widths,
}: {
  headers: string[]
  rows: string[][]
  widths?: string[]
}) {
  return (
    <View style={s.table}>
      <View style={s.tableHeader}>
        {headers.map((header, index) => (
          <Text key={index} style={[s.th, widths ? { width: widths[index] } : { flex: 1 }]}>{header}</Text>
        ))}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={rowIndex % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          {row.map((cell, cellIndex) => (
            <Text key={cellIndex} style={[s.td, widths ? { width: widths[cellIndex] } : { flex: 1 }]}>{cell}</Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function RankedBars({
  items,
  color,
}: {
  items: Array<{ label: string; value: number; pct?: number; meta?: string }>
  color: string
}) {
  const max = Math.max(...items.map((item) => item.value), 1)
  return (
    <View>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={s.rankedRow}>
          <View style={s.rankedTop}>
            <Text style={s.rankedLabel}>{item.label}</Text>
            <Text style={s.rankedValue}>{fmt(item.value)}</Text>
            <Text style={s.rankedPct}>{item.pct == null ? "" : pct(item.pct)}</Text>
          </View>
          <View style={s.rankedTrack}>
            <View style={[s.rankedFill, { width: `${Math.max(4, (item.value / max) * 100)}%`, backgroundColor: color }]} />
          </View>
          {item.meta ? <Text style={s.rankedMeta}>{item.meta}</Text> : null}
        </View>
      ))}
    </View>
  )
}

function TimelineChart({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((item) => item.value), 1)
  return (
    <View style={s.timelineWrap}>
      <View style={s.timelineRow}>
        {items.map((item, index) => (
          <View key={`${item.label}-${index}`} style={s.timelineCol}>
            <Text style={s.timelineValue}>{fmt(item.value)}</Text>
            <View style={s.timelineBarWrap}>
              <View style={[s.timelineBar, { height: Math.max(2, (item.value / max) * 54) }]} />
            </View>
            <Text style={s.timelineLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function RatioBar({ label, value, total, color, meta }: { label: string; value: number; total: number; color: string; meta?: string }) {
  const width = total > 0 ? Math.max(4, (value / total) * 100) : 4
  return (
    <View style={s.ratioRow}>
      <View style={s.ratioTop}>
        <Text style={s.ratioLabel}>{label}</Text>
        <Text style={s.ratioValue}>{fmt(value)} ({rate(value, total)}){meta ? ` - ${meta}` : ""}</Text>
      </View>
      <View style={s.ratioTrack}>
        <View style={[s.ratioFill, { width: `${width}%`, backgroundColor: color }]} />
      </View>
    </View>
  )
}

function Footer({ data, t }: { data: ClientReportData; t: T }) {
  return (
    <View style={s.footer}>
      <Text style={s.footerText}>{t("reports.footer.confidential")}</Text>
      <Text style={s.footerText}>HoneyTrap Platform - {data.meta.generatedAt.slice(0, 10)}</Text>
    </View>
  )
}

export function ReportDocument({ data, t }: { data: ClientReportData; t: T }) {
  const {
    meta,
    overview,
    kpiTrends,
    timeline,
    mitre,
    botRatio,
    insights,
    geo,
    topCredentials,
    credentialSummary,
    diversifiedAttackers,
    sensors,
    malware,
  } = data

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

  const tacticTotals = mitre.tactics
    .map((tactic) => ({
      label: tactic.tactic,
      value: tactic.techniques.reduce((sum, technique) => sum + technique.count, 0),
      pct: mitre.total > 0 ? (tactic.techniques.reduce((sum, technique) => sum + technique.count, 0) / mitre.total) * 100 : 0,
      meta: `${tactic.techniques.length} techniques mapped`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const mitreRows = mitre.tactics
    .flatMap((tactic) => tactic.techniques.slice(0, 4).map((technique) => [
      tactic.tactic,
      `${technique.id} - ${technique.name}`,
      fmt(technique.count),
      mitre.total > 0 ? pct((technique.count / mitre.total) * 100) : "0.0%",
    ]))
    .slice(0, 12)

  const credentialRows = topCredentials.slice(0, 10).map((credential) => [
    credential.username ?? "-",
    truncPassword(credential.password),
    fmt(credential.attempts),
    fmt(credential.successCount),
    rate(credential.successCount, credential.attempts),
  ])

  const recurringRows = insights.recurringIps.slice(0, 8).map((ip) => [
    ip.srcIp,
    fmt(ip.totalSessions),
    fmt(ip.credentialCount),
    fmt(ip.successfulSessions),
    ip.returnAfterMinutes == null ? "-" : `${fmt(ip.returnAfterMinutes)} min`,
  ])

  const diversifiedRows = diversifiedAttackers.slice(0, 6).map((ip) => [
    ip.srcIp,
    fmt(ip.attempts),
    fmt(ip.credentialCount),
    fmt(ip.usernameCount),
    fmt(ip.passwordCount),
  ])

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

  const findings = [
    `${fmt(kpiTrends.events.current)} total events were recorded, with ${fmt(kpiTrends.uniqueIps.current)} unique attacker IPs active in the latest reporting window.`,
    `${sourceRows[0]?.label ?? "SSH"} was the dominant source of activity with ${fmt(sourceRows[0]?.value ?? 0)} events, representing ${totalSourceVolume > 0 ? pct(((sourceRows[0]?.value ?? 0) / totalSourceVolume) * 100) : "0.0%"} of observed volume.`,
    `Peak activity occurred in bucket ${peakTimeline.label} with ${fmt(peakTimeline.value)} events, versus an average of ${fmt(avgTimeline)} per bucket.`,
    `${fmt(credentialSummary.totalAttempts)} credential attempts were seen in the selected period with a ${pct(credentialSummary.successRate * 100)} success rate.`,
  ]

  const fleetRows = sensors.slice(0, 6).map((profile) => ({
    label: `${profile.sensor.name} (${profile.sensor.sensorId})`,
    value: profile.sensor.eventsTotal,
    pct: profile.eventShare,
    meta: `${protocolLabel(profile.sensor.protocol)} - ${profile.sensor.online ? "online" : "offline"} - ${fmt(profile.uniqueIps)} unique IPs`,
  }))

  const malwareRows = malware.slice(0, 6).map((sample) => [
    sample.sensorId ?? "-",
    sample.fileType,
    formatBytes(sample.size),
    sample.source?.toUpperCase() ?? "-",
    sample.srcIp ?? "-",
  ])

  const sensorProtocols = new Set(sensors.map((profile) => profile.sensor.protocol))
  const hasSshSensor = sensorProtocols.has("ssh")
  const hasCredentialSensor =
    credentialSummary.totalAttempts > 0 ||
    topCredentials.length > 0 ||
    sensors.some((profile) => profile.authAttempts > 0 || profile.topCredentials.length > 0)

  const hasWeb = (overview.web.hits ?? 0) > 0

  return (
    <Document title={`Security Report - ${meta.clientName}`} author="HoneyTrap Platform">
      <Page size="A4" style={s.page}>
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
        {sourceBarItems.length > 0 ? (
          <RankedBars items={sourceBarItems} color={C.blue} />
        ) : (
          <Text style={s.noData}>{t("reports.noActivity")}</Text>
        )}

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
        ) : (
          <Text style={s.noData}>{t("reports.noActivity")}</Text>
        )}

        <SectionHeader title={t("reports.section.geo")} />
        {geoBarItems.length > 0 ? (
          <>
            <RankedBars items={geoBarItems} color={C.purple} />
            <SimpleTable
              headers={["Country", "Unique IPs", "Share", "Successful IPs"]}
              rows={geoRows}
              widths={["42%", "18%", "18%", "22%"]}
            />
          </>
        ) : (
          <Text style={s.noData}>{t("reports.noActivity")}</Text>
        )}

        {fleetRows.length > 0 ? (
          <>
            <SectionHeader title="Assigned Sensors" />
            <RankedBars items={fleetRows} color={C.indigo} />
          </>
        ) : null}

        <Footer data={data} t={t} />
      </Page>

      <Page size="A4" style={s.page}>
        {hasSshSensor ? (
          <>
            <SectionHeader title={t("reports.section.classification")} />
            <View style={s.panel}>
              <RatioBar label={t("reports.chart.bot")} value={botRatio.bot} total={botRatio.total} color={C.red} meta="Automated session profile" />
              <RatioBar label={t("reports.chart.human")} value={botRatio.human} total={botRatio.total} color={C.green} meta="Interactive operator profile" />
              <RatioBar label={t("reports.chart.unknown")} value={botRatio.unknown} total={botRatio.total} color={C.gray} meta="Insufficient classification signals" />
            </View>
          </>
        ) : null}

        {malwareRows.length > 0 ? (
          <>
            <SectionHeader title="Malware Artifacts" />
            <View style={s.panel}>
              <Text style={s.bodyText}>{fmt(malware.length)} malware artifacts were captured in the selected period. Samples are attributed to the reporting sensor when the source pipeline provided `sensor_id`.</Text>
            </View>
            <SimpleTable
              headers={["Sensor", "Type", "Size", "Source", "Source IP"]}
              rows={malwareRows}
              widths={["24%", "18%", "16%", "18%", "24%"]}
            />
          </>
        ) : null}

        <SectionHeader title={t("reports.section.threats")} />
        {tacticTotals.length > 0 ? (
          <>
            <View style={s.twoCol}>
              <View style={s.col}>
                <View style={s.panel}>
                  <Text style={s.panelTitle}>Tactic Concentration</Text>
                  <RankedBars items={tacticTotals} color={C.indigo} />
                </View>
              </View>
              <View style={s.col}>
                <View style={s.panel}>
                  <Text style={s.panelTitle}>Technique Coverage</Text>
                  <Text style={s.bodyText}>{fmt(mitre.total)} mapped technique hits across {fmt(mitre.tactics.length)} tactics. This helps distinguish broad probing from multi-stage intrusion behavior.</Text>
                </View>
                <View style={s.panel}>
                  <Text style={s.panelTitle}>Interpretation</Text>
                  <Text style={s.bullet}>- Higher concentration in a single tactic usually indicates repetitive automation.</Text>
                  <Text style={s.bullet}>- Broader tactic coverage suggests progression beyond initial access.</Text>
                </View>
              </View>
            </View>
            <SimpleTable
              headers={[t("reports.mitre.tactic"), t("reports.mitre.techniques"), t("reports.mitre.hits"), "Share"]}
              rows={mitreRows}
              widths={["22%", "48%", "15%", "15%"]}
            />
          </>
        ) : (
          <Text style={s.noData}>{t("reports.noActivity")}</Text>
        )}

        {hasCredentialSensor ? (
          <>
            <SectionHeader title={t("reports.section.credentials")} />
            <View style={s.kpiRow}>
              <KpiCard label="Attempts" value={fmt(credentialSummary.totalAttempts)} meta={`${fmt(credentialSummary.failedAttempts)} failed`} />
              <KpiCard label="Success Rate" value={pct(credentialSummary.successRate * 100)} meta={`${fmt(credentialSummary.successfulAttempts)} successful`} />
              <KpiCard label="Unique Pairs" value={fmt(credentialSummary.uniqueCredentialPairs)} meta={`${fmt(credentialSummary.repeatedCredentialPairs)} repeated`} />
              <KpiCard label="Spray Patterns" value={fmt(credentialSummary.sprayPasswords)} meta={`${fmt(credentialSummary.targetedUsernames)} targeted usernames`} />
            </View>
            {credentialRows.length > 0 ? (
              <SimpleTable
                headers={[t("reports.creds.username"), t("reports.creds.password"), t("reports.creds.attempts"), t("reports.creds.successes"), "Success Rate"]}
                rows={credentialRows}
                widths={["23%", "23%", "18%", "18%", "18%"]}
              />
            ) : (
              <Text style={s.noData}>{t("reports.noActivity")}</Text>
            )}
            {diversifiedRows.length > 0 ? (
              <SimpleTable
                headers={["Attacker IP", "Attempts", "Credential Pairs", "Usernames", "Passwords"]}
                rows={diversifiedRows}
                widths={["30%", "16%", "18%", "18%", "18%"]}
              />
            ) : null}
          </>
        ) : null}

        {hasSshSensor ? (
          <>
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
                  {depthBarItems.length > 0 ? (
                    <RankedBars items={depthBarItems} color={C.indigo} />
                  ) : (
                    <Text style={s.noData}>{t("reports.noActivity")}</Text>
                  )}
                  <Text style={s.bodyText}>Average commands per successful session: {fmt(insights.successfulDepth.averageCommands)}. Maximum observed depth: {fmt(insights.successfulDepth.maxCommands)} commands. Interactive sessions (20+ commands): {fmt(insights.successfulDepth.interactiveSessions)}.</Text>
                </View>
              </View>
            </View>

            {commandPatternRows.length > 0 ? (
              <SimpleTable
                headers={["Command Sequence", "Sessions", "Unique IPs"]}
                rows={commandPatternRows}
                widths={["64%", "18%", "18%"]}
              />
            ) : null}

            {recurringRows.length > 0 ? (
              <>
                <SectionHeader title={t("reports.creds.recurringIps")} />
                <SimpleTable
                  headers={["IP", "Sessions", "Creds", "Success", "Return Delay"]}
                  rows={recurringRows}
                  widths={["30%", "16%", "16%", "16%", "22%"]}
                />
              </>
            ) : null}
          </>
        ) : null}

        {hasWeb ? (
          <>
            <SectionHeader title={t("reports.section.web")} />
            <SimpleTable
              headers={["Metric", "Value"]}
              rows={[
                ["Total Hits", fmt(overview.web.hits)],
                ["Unique IPs", fmt(overview.web.uniqueIps)],
                ["Top Attack Type", overview.web.topAttackType ?? "-"],
              ]}
              widths={["55%", "45%"]}
            />
          </>
        ) : null}

        <Footer data={data} t={t} />
      </Page>

      {sensors.length > 0 ? (
        <Page size="A4" style={s.page}>
          <SectionHeader title="Sensor Profiles" />
          <Text style={[s.bodyText, { marginBottom: 8 }]}>Each assigned sensor below includes its own volume, attacker mix, credential activity, command depth, and malware evidence when available.</Text>

          {sensors.map((profile) => {
            const topAttackerRows = profile.topAttackers.map((item) => [item.srcIp, fmt(item.count)])
            const signalRows = profile.topSignals.map((item) => [item.label, fmt(item.count)])
            const targetRows = profile.topTargets.map((item) => [item.label, fmt(item.count)])
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
              item.srcIp ?? "-",
            ])

            return (
              <View key={profile.sensor.sensorId} style={s.panel}>
              <Text style={s.panelTitle}>{protocolLabel(profile.sensor.protocol)}</Text>
                <Text style={[s.kpiValue, { fontSize: 13, marginBottom: 4 }]}>{profile.sensor.name} ({profile.sensor.sensorId})</Text>
                <Text style={[s.bodyText, { marginBottom: 4 }]}>{sensorNarrative(profile.sensor.protocol)}</Text>
                <Text style={[s.bodyText, { marginBottom: 6 }]}>
                  IP {profile.sensor.ip} | Ports {profile.sensor.ports.length > 0 ? profile.sensor.ports.join(", ") : "-"} | Version {profile.sensor.version || "-"} | Status {profile.sensor.online ? "online" : "offline"} | Last seen {new Date(profile.sensor.lastSeen).toLocaleString("en-US")}
                </Text>

                <View style={s.kpiRow}>
                  <KpiCard label="Events" value={fmt(profile.sensor.eventsTotal)} meta={`${pct(profile.eventShare)} of client volume`} />
                  <KpiCard label="Unique IPs" value={fmt(profile.uniqueIps)} />
                  <KpiCard label="Auth Attempts" value={fmt(profile.authAttempts)} meta={`${fmt(profile.successCount)} successful`} />
                  <KpiCard label="Commands" value={fmt(profile.commandCount)} meta={`${fmt(profile.malwareCount)} malware samples`} />
                </View>

                <View style={s.twoCol}>
                  <View style={s.col}>
                    {topAttackerRows.length > 0 ? (
                      <SimpleTable
                        headers={["Top Attacker", "Hits"]}
                        rows={topAttackerRows}
                        widths={["74%", "26%"]}
                      />
                    ) : (
                      <Text style={s.noData}>No attacker ranking available for this sensor.</Text>
                    )}
                  </View>
                  <View style={s.col}>
                    {signalRows.length > 0 ? (
                      <SimpleTable
                        headers={["Primary Signals", "Count"]}
                        rows={signalRows}
                        widths={["74%", "26%"]}
                      />
                    ) : (
                      <Text style={s.noData}>No signal breakdown available for this sensor.</Text>
                    )}
                  </View>
                </View>

                {targetRows.length > 0 ? (
                  <SimpleTable
                    headers={["Top Targets / Paths", "Count"]}
                    rows={targetRows}
                    widths={["74%", "26%"]}
                  />
                ) : null}

                {sensorCredentialRows.length > 0 ? (
                  <SimpleTable
                    headers={["Username", "Password", "Attempts", "Success Rate"]}
                    rows={sensorCredentialRows}
                    widths={["26%", "26%", "22%", "26%"]}
                  />
                ) : null}

                {sensorMalwareRows.length > 0 ? (
                  <SimpleTable
                    headers={["Malware", "Size", "Source", "Source IP"]}
                    rows={sensorMalwareRows}
                    widths={["28%", "18%", "18%", "36%"]}
                  />
                ) : null}
              </View>
            )
          })}

          <Footer data={data} t={t} />
        </Page>
      ) : null}
    </Document>
  )
}
