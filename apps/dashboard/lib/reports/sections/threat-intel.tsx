import React from "react"
import { Page, Text, View } from "@react-pdf/renderer"
import type { ClientReportData, ReportActorIntel } from "../types"
import { C, Footer, s, SectionHeader, SimpleTable, type T } from "../shared/pdf-ui"
import { actorTableRows, iocTables, originLine, reputationLine } from "../shared/threat-intel-view"

const LEVEL_COLOR: Record<string, string> = {
  CRITICAL: C.red,
  HIGH: C.amber,
  MEDIUM: C.blue,
  LOW: C.gray,
  INFO: C.gray,
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 5 }}>
      <Text style={s.panelTitle}>{label}</Text>
      <Text style={s.bodyText}>{value}</Text>
    </View>
  )
}

function ActorCard({ actor, t }: { actor: ReportActorIntel; t: T }) {
  const ai = actor.analysis

  return (
    <View style={s.panel} wrap={false}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
        <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: C.textDark }}>{actor.ip}</Text>
        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: LEVEL_COLOR[actor.level] ?? C.gray }}>
          {actor.score}/100 {actor.level}
        </Text>
      </View>
      <Text style={{ ...s.bodyText, color: C.textMuted, marginBottom: 5 }}>
        {originLine(actor)} | {reputationLine(actor)}
        {actor.lastReportedAt ? ` | ${t("reports.ti.lastReported")} ${actor.lastReportedAt.slice(0, 10)}` : ""}
      </Text>

      {actor.topFactors.length > 0 ? (
        <Field label={t("reports.ti.factors")} value={actor.topFactors.join(" · ")} />
      ) : null}
      {actor.ports.length > 0 ? (
        <Field label={t("reports.ti.ports")} value={actor.ports.join(", ")} />
      ) : null}
      {actor.vtFlaggedBy.length > 0 ? (
        <Field label={t("reports.ti.flaggedBy")} value={actor.vtFlaggedBy.join(", ")} />
      ) : null}

      {ai ? (
        <>
          <Field label={t("reports.ti.profile")} value={ai.actorProfile} />
          {ai.intent ? <Field label={t("reports.ti.intent")} value={ai.intent} /> : null}
          <Field label={t("reports.ti.sophistication")} value={ai.sophistication} />
          {ai.keyTactics.length > 0 ? (
            <Field label={t("reports.ti.tactics")} value={ai.keyTactics.map((k) => `• ${k}`).join("\n")} />
          ) : null}
          {ai.webFindings ? <Field label={t("reports.ti.webFindings")} value={ai.webFindings} /> : null}
          {ai.iocs.length > 0 ? <Field label={t("reports.ti.iocs")} value={ai.iocs.join(", ")} /> : null}
          {ai.recommendation ? <Field label={t("reports.ti.recommendation")} value={ai.recommendation} /> : null}
          {ai.sources.length > 0 ? (
            <Field label={t("reports.ti.sources")} value={ai.sources.map((src) => `${src.title} — ${src.url}`).join("\n")} />
          ) : null}
        </>
      ) : (
        <Text style={s.noData}>{t("reports.ti.noAnalysis")}</Text>
      )}
    </View>
  )
}

export function ThreatIntelPages({ data, t }: { data: ClientReportData; t: T }) {
  const intel = data.threatIntel
  if (!intel) return null

  const tables = iocTables(intel.iocs, t)
  const analyzed = intel.actors.filter((actor) => actor.analysis)

  return (
    <>
      <Page size="A4" style={s.page}>
        <SectionHeader title={t("reports.ti.title")} />
        <View style={s.panel}>
          <Text style={s.bodyText}>{t("reports.ti.subtitle")}</Text>
        </View>
        {intel.actors.length > 0 ? (
          <SimpleTable
            headers={[
              t("reports.ti.actor"),
              t("reports.ti.risk"),
              t("reports.mitre.techniques"),
              t("reports.ti.activity"),
              t("reports.ti.origin"),
              t("reports.ti.reputation"),
            ]}
            rows={actorTableRows(intel.actors)}
            widths={["16%", "13%", "14%", "19%", "22%", "16%"]}
          />
        ) : (
          <Text style={s.noData}>{t("reports.ti.noActors")}</Text>
        )}

        {tables.length > 0 ? (
          <>
            <SectionHeader title={t("reports.ti.iocsTitle")} />
            {tables.map((table) => (
              <View key={table.title}>
                <Text style={s.panelTitle}>{table.title}</Text>
                <SimpleTable headers={table.headers} rows={table.rows} />
              </View>
            ))}
          </>
        ) : null}
        <Footer data={data} t={t} />
      </Page>

      {analyzed.length > 0 ? (
        <Page size="A4" style={s.page}>
          <SectionHeader title={t("reports.ti.profile")} />
          {analyzed.map((actor) => (
            <ActorCard key={actor.ip} actor={actor} t={t} />
          ))}
          <Footer data={data} t={t} />
        </Page>
      ) : null}
    </>
  )
}
