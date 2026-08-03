"use client"

import { useLocale } from "@/components/locale-provider"
import type { ClientReportData, ReportActorIntel } from "@/lib/reports/types"
import {
  actorTableRows,
  iocTables,
  originLine,
  reputationLine,
} from "@/lib/reports/shared/threat-intel-view"
import { Field, Section, Table } from "./report-ui"

function ActorCard({ actor }: { actor: ReportActorIntel }) {
  const { t } = useLocale()
  const ai = actor.analysis

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-semibold text-foreground">{actor.ip}</p>
        <p className="text-xs font-semibold text-primary">{actor.score}/100 · {actor.level}</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {originLine(actor)} — {reputationLine(actor)}
        {actor.lastReportedAt ? ` — ${t("reports.ti.lastReported")} ${actor.lastReportedAt.slice(0, 10)}` : ""}
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {actor.topFactors.length > 0 && (
          <Field label={t("reports.ti.factors")}>{actor.topFactors.join(" · ")}</Field>
        )}
        {actor.vtFlaggedBy.length > 0 && (
          <Field label={t("reports.ti.flaggedBy")}>{actor.vtFlaggedBy.join(", ")}</Field>
        )}
        {ai ? (
          <>
            <Field label={t("reports.ti.profile")}>{ai.actorProfile}</Field>
            {ai.intent && <Field label={t("reports.ti.intent")}>{ai.intent}</Field>}
            <Field label={t("reports.ti.sophistication")}>{ai.sophistication}</Field>
            {ai.keyTactics.length > 0 && (
              <Field label={t("reports.ti.tactics")}>
                <ul className="list-disc pl-5">
                  {ai.keyTactics.map((tactic, i) => <li key={i}>{tactic}</li>)}
                </ul>
              </Field>
            )}
            {ai.webFindings && <Field label={t("reports.ti.webFindings")}>{ai.webFindings}</Field>}
            {ai.iocs.length > 0 && (
              <Field label={t("reports.ti.iocs")}>
                <span className="break-all font-mono text-xs">{ai.iocs.join(", ")}</span>
              </Field>
            )}
            {ai.recommendation && <Field label={t("reports.ti.recommendation")}>{ai.recommendation}</Field>}
            {ai.sources.length > 0 && (
              <Field label={t("reports.ti.sources")}>
                <ul className="list-disc pl-5 text-xs">
                  {ai.sources.map((src) => (
                    <li key={src.url} className="break-all">{src.title} — {src.url}</li>
                  ))}
                </ul>
              </Field>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("reports.ti.noAnalysis")}</p>
        )}
      </div>
    </div>
  )
}

export function ThreatIntelSection({
  intel,
  insight,
}: {
  intel: NonNullable<ClientReportData["threatIntel"]>
  insight?: string
}) {
  const { t } = useLocale()
  const tables = iocTables(intel.iocs, t)
  const detailed = intel.actors.filter((actor) => actor.analysis || actor.topFactors.length > 0)

  return (
    <Section title={t("reports.ti.title")} subtitle={t("reports.ti.subtitle")} insight={insight}>
      <Table
        headers={[
          t("reports.ti.actor"),
          t("reports.ti.risk"),
          t("reports.mitre.techniques"),
          t("reports.ti.activity"),
          t("reports.ti.origin"),
          t("reports.ti.reputation"),
        ]}
        rows={actorTableRows(intel.actors)}
      />

      {detailed.length > 0 && (
        <div className="mt-5 flex flex-col gap-4">
          {detailed.map((actor) => <ActorCard key={actor.ip} actor={actor} />)}
        </div>
      )}

      {tables.length > 0 && (
        <div className="mt-5 flex flex-col gap-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("reports.ti.iocsTitle")}
          </p>
          {tables.map((table) => (
            <div key={table.title}>
              <p className="mb-2 text-xs text-muted-foreground">{table.title}</p>
              <Table headers={table.headers} rows={table.rows} />
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
