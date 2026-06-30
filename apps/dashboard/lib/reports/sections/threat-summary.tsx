import React from "react"
import { Text, View } from "@react-pdf/renderer"
import type { ClientReportData } from "../types"
import { fmt, formatBytes, pct } from "../shared/format"
import { C, RankedBars, s, SectionHeader, SimpleTable, type T } from "../shared/pdf-ui"

export function ThreatSummarySection({ data, t }: { data: ClientReportData; t: T }) {
  const { malware, mitre } = data

  const malwareRows = malware.slice(0, 6).map((sample) => [
    sample.sensorId ?? "-",
    sample.fileType,
    formatBytes(sample.size),
    sample.source?.toUpperCase() ?? "-",
    sample.srcIp ?? "-",
  ])

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

  return (
    <>
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
    </>
  )
}
