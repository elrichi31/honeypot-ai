"use client"

import { useLocale } from "@/components/locale-provider"
import { fmt, pct, deltaStr, sumBucket } from "@/lib/reports/shared/format"
import type { ClientReportData } from "@/lib/reports/types"
import type { MetricTrend } from "@/lib/api/types"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="report-section rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Kpi({ label, value, trend }: { label: string; value: string; trend?: MetricTrend }) {
  const delta = trend ? deltaStr(trend.deltaPct) : null
  const up = (trend?.deltaPct ?? 0) >= 0
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      {delta && (
        <p className={`text-xs font-medium ${up ? "text-emerald-500" : "text-rose-500"}`}>{delta}</p>
      )}
    </div>
  )
}

function Bars({ items }: { items: { label: string; value: number; meta?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.length) return <EmptyRow />
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="flex items-center gap-3">
          <div className="w-32 shrink-0 truncate text-xs text-muted-foreground" title={item.label}>
            {item.label}
          </div>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/40">
            <div
              className="h-full rounded bg-primary/70"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <div className="w-24 shrink-0 text-right text-xs tabular-nums text-foreground">
            {fmt(item.value)}
            {item.meta ? <span className="ml-1 text-muted-foreground">{item.meta}</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <EmptyRow />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 tabular-nums text-foreground">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyRow() {
  const { t } = useLocale()
  return <p className="text-sm text-muted-foreground">{t("reports.noActivity")}</p>
}

export function ReportView({ data }: { data: ClientReportData }) {
  const { t } = useLocale()
  const { meta, overview, kpiTrends, timeline, mitre, botRatio, insights, geo, topCredentials, credentialSummary } = data

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

  return (
    <div id="report-print-root" className="flex flex-col gap-5">
      <header className="report-section rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-bold text-foreground">{meta.clientName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("reports.footer.period")}: {meta.periodLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("reports.footer.generated")}: {generatedDate}
        </p>
      </header>

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
        <Section title={t("reports.section.timeline")}>
          <Bars items={timelineItems} />
        </Section>
        <Section title={t("reports.chart.activity")}>
          <Bars items={sourceItems} />
        </Section>
      </div>

      <Section title={t("reports.section.threats")}>
        <Table
          headers={[t("reports.mitre.tactic"), t("reports.mitre.techniques"), t("reports.mitre.hits")]}
          rows={mitre.tactics.slice(0, 12).map((tactic) => [
            tactic.tactic,
            tactic.techniques.map((tech) => tech.name).slice(0, 4).join(", ") || "-",
            fmt(tactic.techniques.reduce((sum, tech) => sum + tech.count, 0)),
          ])}
        />
      </Section>

      <Section title={t("reports.section.credentials")}>
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
        <Section title={t("reports.section.reconnaissance")}>
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
        <Section title={t("reports.section.geo")}>
          <Table
            headers={["", t("reports.kpi.uniqueIps"), "%"]}
            rows={geo.slice(0, 12).map((g) => [
              `${g.country} (${g.countryCode})`, fmt(g.count), pct(g.share),
            ])}
          />
        </Section>
      </div>

      <Section title={t("reports.section.classification")}>
        <Bars items={classificationItems} />
      </Section>

      <p className="text-center text-xs text-muted-foreground">{t("reports.footer.confidential")}</p>
    </div>
  )
}
