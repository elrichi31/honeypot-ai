"use client"

import { useLocale } from "@/components/locale-provider"
import { fmt, pct, rate } from "@/lib/reports/shared/format"
import type { ReportWebProfile } from "@/lib/reports/types"
import { Kpi, Section, Table } from "./report-ui"
import { ShareBar } from "./report-charts"

export function WebIntelSection({ web, insight }: { web: ReportWebProfile; insight?: string }) {
  const { t } = useLocale()

  const highSignal = web.canaryHits + web.chainHits
  const depth = web.sessionCount > 0 ? web.hits / web.sessionCount : 0

  return (
    <Section title={t("reports.web.title")} subtitle={t("reports.web.subtitle")} insight={insight}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={t("reports.web.hits")} value={fmt(web.hits)} meta={`${fmt(web.uniquePaths)} ${t("reports.web.paths").toLowerCase()}`} />
        <Kpi label={t("reports.web.sessions")} value={fmt(web.sessionCount)} meta={`${fmt(web.fingerprintedSessions)} ${t("reports.web.fingerprinted")}`} />
        <Kpi label={t("reports.web.attackTypes")} value={fmt(web.attackTypeCount)} />
        <Kpi label={t("reports.web.highSignal")} value={fmt(highSignal)} meta={rate(highSignal, web.hits)} />
      </div>

      {web.topAttackTypes.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.web.attackMix")}</p>
          <ShareBar items={web.topAttackTypes.slice(0, 6).map((a) => ({ label: a.label, value: a.count }))} />
        </div>
      )}

      <div className="mt-5 border-l-2 border-border pl-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("reports.web.reading")}</p>
        <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed text-foreground">
          <li>{fmt(web.canaryHits)} {t("reports.web.readCanary")}</li>
          <li>{fmt(web.chainHits)} {t("reports.web.readChain")}</li>
          <li>{fmt(web.multiIpSessions)} {t("reports.web.readMultiIp")}</li>
          <li>{depth.toFixed(1)} {t("reports.web.readDepth")}</li>
        </ul>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.web.topPaths")}</p>
          <Table
            headers={["", t("reports.sensor.hits"), "%"]}
            rows={web.topPaths.slice(0, 10).map((p) => [p.label, fmt(p.count), rate(p.count, web.hits)])}
          />
        </div>
        <div className="flex flex-col gap-5">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.web.methods")}</p>
            <Table
              headers={["", t("reports.sensor.hits"), "%"]}
              rows={web.topMethods.map((m) => [m.label, fmt(m.count), rate(m.count, web.hits)])}
            />
          </div>
          {web.topCanaryTokens.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.web.canaries")}</p>
              <Table
                headers={["", t("reports.sensor.hits"), "%"]}
                rows={web.topCanaryTokens.map((c) => [
                  c.label,
                  fmt(c.count),
                  pct(web.canaryHits > 0 ? (c.count / web.canaryHits) * 100 : 0),
                ])}
              />
            </div>
          )}
        </div>
      </div>

      {web.topSessions.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.web.dominantSessions")}</p>
          <Table
            headers={[
              t("reports.web.fingerprint"),
              t("reports.sensor.hits"),
              t("reports.web.ips"),
              t("reports.web.chain"),
              t("reports.web.canary"),
            ]}
            rows={web.topSessions.map((s) => [s.label, fmt(s.hits), fmt(s.ipCount), fmt(s.chainHits), fmt(s.canaryHits)])}
          />
        </div>
      )}

      {web.topUserAgents.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.web.userAgents")}</p>
          <Table
            headers={["", t("reports.sensor.hits")]}
            rows={web.topUserAgents.map((ua) => [ua.label, fmt(ua.count)])}
          />
        </div>
      )}
    </Section>
  )
}
