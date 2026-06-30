// Server-only: React-PDF document component.
import React from "react"
import { Document, Page, Text, View } from "@react-pdf/renderer"
import type { ClientReportData } from "./types"
import { aggregateLabelCounts, deltaStr, fmt, formatBytes, pct, rate, sumBucket } from "./shared/format"
import { C, Footer, KpiCard, RankedBars, RatioBar, s, SectionHeader, SimpleTable, TimelineChart, type T } from "./shared/pdf-ui"
import { SensorPage } from "./sensors/sensor-page"

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

  const geoRows = geo.slice(0, 10).map((entry) => ([`${entry.country} (${entry.countryCode})`, fmt(entry.count), pct(entry.share), fmt(entry.successCount)]))
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
    credential.password ?? "-",
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
    meta: `${profile.sensor.protocol.toUpperCase()} - ${profile.sensor.online ? "online" : "offline"} - ${fmt(profile.uniqueIps)} unique IPs`,
  }))

  const malwareRows = malware.slice(0, 6).map((sample) => [sample.sensorId ?? "-", sample.fileType, formatBytes(sample.size), sample.source?.toUpperCase() ?? "-", sample.srcIp ?? "-"])
  const sensorProtocols = new Set(sensors.map((profile) => profile.sensor.protocol))
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
  const webAttackBarItems = aggregateLabelCounts(webProfiles.map((profile) => profile.web?.topAttackTypes ?? []), 6).map((item) => ({
    label: item.label,
    value: item.count,
    pct: webTotals.hits > 0 ? (item.count / webTotals.hits) * 100 : 0,
  }))
  const webPathRows = aggregateLabelCounts(webProfiles.map((profile) => profile.web?.topPaths ?? []), 6).map((item) => [item.label, fmt(item.count), rate(item.count, Math.max(webTotals.hits, 1))])
  const webMethodRows = aggregateLabelCounts(webProfiles.map((profile) => profile.web?.topMethods ?? []), 5).map((item) => [item.label, fmt(item.count), rate(item.count, Math.max(webTotals.hits, 1))])

  const hasSshSensor = sensorProtocols.has("ssh")
  const hasCredentialSensor = credentialSummary.totalAttempts > 0 || topCredentials.length > 0 || sensors.some((profile) => profile.authAttempts > 0 || profile.topCredentials.length > 0)
  const hasWeb = webProfiles.length > 0 && (overview.web.hits ?? 0) > 0

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
            <SimpleTable headers={["Sensor", "Type", "Size", "Source", "Source IP"]} rows={malwareRows} widths={["24%", "18%", "16%", "18%", "24%"]} />
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
            <SimpleTable headers={[t("reports.mitre.tactic"), t("reports.mitre.techniques"), t("reports.mitre.hits"), "Share"]} rows={mitreRows} widths={["22%", "48%", "15%", "15%"]} />
          </>
        ) : <Text style={s.noData}>{t("reports.noActivity")}</Text>}

        {hasCredentialSensor ? (
          <>
            <SectionHeader title={t("reports.section.credentials")} />
            <View style={s.kpiRow}>
              <KpiCard label="Attempts" value={fmt(credentialSummary.totalAttempts)} meta={`${fmt(credentialSummary.failedAttempts)} failed`} />
              <KpiCard label="Success Rate" value={pct(credentialSummary.successRate * 100)} meta={`${fmt(credentialSummary.successfulAttempts)} successful`} />
              <KpiCard label="Unique Pairs" value={fmt(credentialSummary.uniqueCredentialPairs)} meta={`${fmt(credentialSummary.repeatedCredentialPairs)} repeated`} />
              <KpiCard label="Spray Patterns" value={fmt(credentialSummary.sprayPasswords)} meta={`${fmt(credentialSummary.targetedUsernames)} targeted usernames`} />
            </View>
            {credentialRows.length > 0 ? <SimpleTable headers={[t("reports.creds.username"), t("reports.creds.password"), t("reports.creds.attempts"), t("reports.creds.successes"), "Success Rate"]} rows={credentialRows} widths={["23%", "23%", "18%", "18%", "18%"]} /> : <Text style={s.noData}>{t("reports.noActivity")}</Text>}
            {diversifiedRows.length > 0 ? <SimpleTable headers={["Attacker IP", "Attempts", "Credential Pairs", "Usernames", "Passwords"]} rows={diversifiedRows} widths={["30%", "16%", "18%", "18%", "18%"]} /> : null}
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
        ) : null}

        {hasWeb ? (
          <>
            <SectionHeader title={t("reports.section.web")} />
            <View style={s.kpiRow}>
              <KpiCard label="Total Hits" value={fmt(overview.web.hits)} meta={`${fmt(overview.web.uniqueIps)} unique IPs`} />
              <KpiCard label="Observed Sessions" value={fmt(webTotals.sessionCount)} meta={`${fmt(webTotals.multiIpSessions)} multi-IP fingerprints`} />
              <KpiCard label="Targeted Paths" value={fmt(webTotals.uniquePaths)} meta={overview.web.topAttackType ? `Top type: ${overview.web.topAttackType}` : undefined} />
              <KpiCard label="High-Signal Requests" value={fmt(webTotals.canaryHits + webTotals.chainHits)} meta={`${fmt(webTotals.canaryHits)} canary + ${fmt(webTotals.chainHits)} chain`} />
            </View>
            <View style={s.twoCol}>
              <View style={s.col}>
                {webAttackBarItems.length > 0 ? <RankedBars items={webAttackBarItems} color={C.indigo} /> : <Text style={s.noData}>{t("reports.noActivity")}</Text>}
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
        ) : null}

        <Footer data={data} t={t} />
      </Page>

      {sensors.map((profile) => (
        <Page key={profile.sensor.sensorId} size="A4" style={s.page}>
          <SensorPage profile={profile} t={t} />
          <Footer data={data} t={t} />
        </Page>
      ))}
    </Document>
  )
}
