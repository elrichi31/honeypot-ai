"use client"

import { useLocale } from "@/components/locale-provider"
import { fmt, pct, sumBucket, buildPeriodLabel } from "@/lib/reports/shared/format"
import type { ClientReportData, ReportNarrative, ReportTheme } from "@/lib/reports/types"
import { Bars, Kpi, Section, Table } from "./report-ui"
import { ThreatIntelSection } from "./report-threat-intel"
import { SensorDetailSection, SensorFleetSection } from "./report-sensors"
import { WebIntelSection } from "./report-web"
import { mergeWebProfiles } from "@/lib/reports/shared/web-merge"

function Narrative({
  narrative,
  pending,
}: {
  narrative: ReportNarrative | null
  pending: boolean
}) {
  const { t } = useLocale()

  // Nothing written and nothing coming (AI not configured) — the report simply
  // has no narrative, which is a valid report, not an error worth a placeholder.
  if (!narrative && !pending) return null

  if (!narrative) {
    return (
      <section className="report-section rounded-xl border border-border bg-card p-5 print:hidden">
        <p className="text-sm text-muted-foreground">{t("reports.narrative.pending")}</p>
      </section>
    )
  }

  const blocks = [
    { title: t("reports.narrative.summary"), body: narrative.executiveSummary },
    { title: t("reports.narrative.landscape"), body: narrative.threatLandscape },
    { title: t("reports.narrative.credentials"), body: narrative.credentialFindings },
  ].filter((b) => b.body)

  return (
    <Section title={t("reports.narrative.title")}>
      <div className="flex flex-col gap-4">
        {blocks.map((b) => (
          <div key={b.title}>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{b.title}</p>
            <p className="text-sm leading-relaxed text-foreground">{b.body}</p>
          </div>
        ))}
        {narrative.recommendations.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("reports.narrative.recommendations")}
            </p>
            <ul className="list-disc pl-5 text-sm leading-relaxed text-foreground">
              {narrative.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("reports.narrative.disclaimer")}</p>
      </div>
    </Section>
  )
}

export function ReportView({
  data,
  narrative = null,
  narrativePending = false,
  theme = "light",
}: {
  data: ClientReportData
  narrative?: ReportNarrative | null
  narrativePending?: boolean
  theme?: ReportTheme
}) {
  const { t } = useLocale()
  const insight = (key: string) => narrative?.sections?.[key]
  const { meta, overview, kpiTrends, timeline, mitre, botRatio, insights, geo, topCredentials, credentialSummary, history } = data

  const generatedDate = new Date(meta.generatedAt).toLocaleString("en-US", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  })

  const timelineItems = timeline.buckets.map((b) => ({
    label: String(b.label ?? "").slice(0, 12),
    value: sumBucket(b),
  }))

  const sourceItems = [
    { label: "SSH", value: overview.ssh.sessions, meta: `· ${fmt(overview.ssh.uniqueIps)} IPs` },
    { label: "Web", value: overview.web.hits, meta: `· ${fmt(overview.web.uniqueIps)} IPs` },
    ...overview.protocols.slice(0, 6).map((p) => ({
      label: p.protocol.toUpperCase(),
      value: p.count,
      meta: `· ${fmt(p.uniqueIps)} IPs`,
    })),
  ].filter((r) => r.value > 0)

  const funnel = insights.funnel
  const funnelItems = [
    { label: t("reports.funnel.connections"), value: funnel.connections },
    { label: t("reports.funnel.authAttempts"), value: funnel.authAttempts },
    { label: t("reports.funnel.loginSuccess"), value: funnel.loginSuccess },
    { label: t("reports.funnel.commands"), value: funnel.commands },
    { label: t("reports.funnel.compromise"), value: funnel.highSignalCompromise },
  ]

  const classificationItems = [
    { label: t("reports.chart.bot"), value: botRatio.bot },
    { label: t("reports.chart.human"), value: botRatio.human },
    { label: t("reports.chart.unknown"), value: botRatio.unknown },
  ].filter((r) => r.value > 0)

  const web = mergeWebProfiles(data.sensors)

  return (
    <div id="report-print-root" data-report-theme={theme} className="flex flex-col gap-5 bg-background text-foreground">
      <header className="report-section rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-bold text-primary">{meta.clientName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("reports.footer.period")}: {meta.periodLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("reports.footer.generated")}: {generatedDate}
        </p>
      </header>

      <Narrative narrative={narrative} pending={narrativePending} />

      <Section title={t("reports.section.executive")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label={t("reports.kpi.events")} value={fmt(kpiTrends.events.current)} trend={kpiTrends.events} />
          <Kpi label={t("reports.kpi.sessions")} value={fmt(kpiTrends.sshSessions.current)} trend={kpiTrends.sshSessions} />
          <Kpi label={t("reports.kpi.webHits")} value={fmt(kpiTrends.webHits.current)} trend={kpiTrends.webHits} />
          <Kpi label={t("reports.kpi.uniqueIps")} value={fmt(kpiTrends.uniqueIps.current)} trend={kpiTrends.uniqueIps} />
          <Kpi label={t("reports.kpi.successLogins")} value={fmt(overview.ssh.successfulLogins)} />
          <Kpi label={t("reports.kpi.botPct")} value={pct(botRatio.botPct)} />
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("reports.section.timeline")} insight={insight("timeline")}>
          <Bars items={timelineItems} />
        </Section>
        <Section title={t("reports.chart.activity")} insight={insight("sources")}>
          <Bars items={sourceItems} />
        </Section>
      </div>

      <SensorFleetSection data={data} insight={insight("sensors")} />

      <Section title={t("reports.section.threats")} insight={insight("mitre")}>
        <Table
          headers={[t("reports.mitre.tactic"), t("reports.mitre.techniques"), t("reports.mitre.hits")]}
          rows={mitre.tactics.slice(0, 12).map((tactic) => [
            tactic.tactic,
            tactic.techniques.map((tech) => tech.name).slice(0, 4).join(", ") || "-",
            fmt(tactic.techniques.reduce((sum, tech) => sum + tech.count, 0)),
          ])}
        />
      </Section>

      {data.threatIntel && <ThreatIntelSection intel={data.threatIntel} insight={insight("actors")} />}

      {web && <WebIntelSection web={web} insight={insight("web")} />}

      <Section title={t("reports.section.credentials")} insight={insight("credentials")}>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label={t("reports.creds.attempts")} value={fmt(credentialSummary.totalAttempts)} />
          <Kpi label={t("reports.creds.successes")} value={fmt(credentialSummary.successfulAttempts)} />
          <Kpi label={t("reports.creds.username")} value={fmt(credentialSummary.uniqueUsernames)} />
          <Kpi label={t("reports.creds.password")} value={fmt(credentialSummary.uniquePasswords)} />
        </div>
        <Table
          headers={[t("reports.creds.username"), t("reports.creds.password"), t("reports.creds.attempts"), t("reports.creds.successes")]}
          rows={topCredentials.slice(0, 10).map((c) => [
            c.username ?? "-", c.password ?? "-", fmt(c.attempts), fmt(c.successCount),
          ])}
        />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("reports.section.reconnaissance")} insight={insight("reconnaissance")}>
          <Bars items={funnelItems} />
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.creds.recurringIps")}</p>
            <Table
              headers={["IP", t("reports.kpi.sessions"), t("reports.creds.successes")]}
              rows={insights.recurringIps.slice(0, 8).map((ip) => [
                ip.srcIp, fmt(ip.totalSessions), fmt(ip.successfulSessions),
              ])}
            />
          </div>
        </Section>
        <Section title={t("reports.section.geo")} insight={insight("geo")}>
          <Table
            headers={["", t("reports.kpi.uniqueIps"), "%"]}
            rows={geo.slice(0, 12).map((g) => [
              `${g.country} (${g.countryCode})`, fmt(g.count), pct(g.share),
            ])}
          />
        </Section>
      </div>

      <Section title={t("reports.section.classification")} insight={insight("classification")}>
        <Bars items={classificationItems} />
      </Section>

      {history && (
        <Section title={t("reports.section.history")} insight={insight("history")}>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("reports.history.subtitle")}
            {/* End is generation time, not the last bucket: at 1y granularity
                buckets are week starts, so printing the last one made coverage
                look like it stopped six days before the report was run. */}
            {history.firstBucket
              ? ` ${buildPeriodLabel(history.firstBucket, meta.generatedAt, meta.timezone)}.`
              : ""}
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi label={t("reports.kpi.events")} value={fmt(history.totalEvents)} />
            <Kpi label={t("reports.history.sshAttempts")} value={fmt(history.totalAttempts)} />
            <Kpi label={t("reports.history.successRate")} value={pct(history.successRatePct)} />
          </div>
          <Bars items={history.byProtocol.map((p) => ({ label: p.label, value: p.count }))} />
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.history.topCredentials")}</p>
            <Table
              headers={[t("reports.creds.username"), t("reports.creds.password"), t("reports.creds.attempts")]}
              rows={history.topCredentials.map((c) => [c.username ?? "-", c.password ?? "-", fmt(c.count)])}
            />
          </div>
        </Section>
      )}

      {/* Per-sensor detail closes the report: the fleet table above says which
          decoy mattered, these say exactly what each one saw. */}
      {data.sensors.map((profile) => (
        <SensorDetailSection key={profile.sensor.sensorId} profile={profile} />
      ))}

      <p className="text-center text-xs text-muted-foreground">{t("reports.footer.confidential")}</p>
    </div>
  )
}
