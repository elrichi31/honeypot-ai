"use client"

import { useLocale } from "@/components/locale-provider"
import { fmt, formatBytes, protocolLabel, rate } from "@/lib/reports/shared/format"
import type { ClientReportData, ReportSensorProfile } from "@/lib/reports/types"
import { Bars, Kpi, Section, Table } from "./report-ui"
import { DailyBars, HourHeatmap, ShareBar } from "./report-charts"

function labelledTable(label: string, headers: string[], rows: (string | number)[][]) {
  return rows.length > 0 ? { label, headers, rows } : null
}

export function SensorFleetSection({ data, insight }: { data: ClientReportData; insight?: string }) {
  const { t } = useLocale()
  const { sensors, persistentAttackers } = data

  if (sensors.length === 0) return null

  const online = sensors.filter((p) => p.sensor.online).length
  const services = new Set(sensors.map((p) => p.sensor.protocol)).size
  const totalEvents = sensors.reduce((sum, p) => sum + p.sensor.eventsTotal, 0)

  return (
    <Section title={t("reports.fleet.title")} subtitle={t("reports.fleet.subtitle")} insight={insight}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={t("reports.fleet.sensors")} value={fmt(sensors.length)} />
        <Kpi label={t("reports.fleet.online")} value={`${fmt(online)}/${fmt(sensors.length)}`} />
        <Kpi label={t("reports.fleet.protocols")} value={fmt(services)} />
        <Kpi label={t("reports.kpi.events")} value={fmt(totalEvents)} />
      </div>

      {totalEvents > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.fleet.share")}</p>
          <ShareBar
            items={sensors
              .filter((p) => p.sensor.eventsTotal > 0)
              .slice(0, 6)
              .map((p) => ({ label: p.sensor.name, value: p.sensor.eventsTotal }))}
          />
        </div>
      )}

      <div className="mt-5">
        <Table
          headers={[
            t("reports.fleet.sensor"),
            t("reports.fleet.service"),
            t("reports.fleet.status"),
            t("reports.fleet.events"),
            t("reports.kpi.uniqueIps"),
            t("reports.sensor.auth"),
            t("reports.creds.successes"),
            t("reports.sensor.malware"),
          ]}
          rows={sensors.map((p) => [
            `${p.sensor.name} · ${p.sensor.ip}`,
            protocolLabel(p.sensor.protocol),
            p.sensor.online ? t("reports.fleet.online.yes") : t("reports.fleet.online.no"),
            p.sensor.eventsTotal > 0
              ? `${fmt(p.sensor.eventsTotal)} (${p.eventShare.toFixed(1)}%)`
              : t("reports.fleet.quiet"),
            fmt(p.uniqueIps),
            fmt(p.authAttempts),
            fmt(p.successCount),
            fmt(p.malwareCount),
          ])}
        />
      </div>

      {persistentAttackers.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.fleet.persistent")}</p>
          <Table
            headers={["IP", t("reports.fleet.activeDays"), t("reports.fleet.totalHits")]}
            rows={persistentAttackers.map((a) => [a.ip, fmt(a.activeDays), fmt(a.totalHits)])}
          />
        </div>
      )}
    </Section>
  )
}

export function SensorDetailSection({ profile }: { profile: ReportSensorProfile }) {
  const { t } = useLocale()
  const sensor = profile.sensor

  const attackerRows = profile.topEnrichedAttackers.length > 0
    ? {
        headers: ["IP", t("reports.sensor.country"), t("reports.sensor.org"), t("reports.sensor.abuse"), t("reports.sensor.hits")],
        rows: profile.topEnrichedAttackers.map((a) => [a.ip, a.country, a.org, a.abuseScore > 0 ? String(a.abuseScore) : "-", fmt(a.hits)]),
      }
    : {
        headers: ["IP", t("reports.sensor.hits")],
        rows: profile.topAttackers.map((a) => [a.srcIp, fmt(a.count)]),
      }

  // Every protocol-specific block the collector may have filled. Empty ones are
  // dropped so an FTP decoy never prints empty SMB tables.
  const intel = [
    labelledTable(t("reports.sensor.ids"), [t("reports.sensor.signature"), t("reports.sensor.severity"), t("reports.sensor.hits")],
      profile.suricataAlerts.map((a) => [a.signature, String(a.severity), fmt(a.count)])),
    labelledTable(t("reports.sensor.clients"), ["", t("reports.kpi.sessions"), t("reports.creds.successes")],
      profile.sshFingerprints.map((f) => [f.clientVersion, fmt(f.sessions), fmt(f.successes)])),
    labelledTable(t("reports.sensor.smbShares"), ["", t("reports.sensor.hits")], profile.smbShares.map((r) => [r.label, fmt(r.count)])),
    labelledTable(t("reports.sensor.smbDomains"), ["", t("reports.sensor.hits")], profile.smbDomains.map((r) => [r.label, fmt(r.count)])),
    labelledTable(t("reports.sensor.smbHosts"), ["", "", t("reports.sensor.hits")], profile.smbHosts.map((r) => [r.label, r.detail ?? "-", fmt(r.count)])),
    labelledTable(t("reports.sensor.ntlm"), ["", "", t("reports.sensor.hits")], profile.smbNtlmHashes.map((r) => [r.label, r.detail ?? "-", fmt(r.count)])),
    labelledTable(t("reports.sensor.ftp"), ["", t("reports.sensor.hits")], profile.ftpCommands.map((r) => [r.label, fmt(r.count)])),
    labelledTable(t("reports.sensor.transfers"), ["", "", t("reports.sensor.hits")], profile.fileTransfers.map((r) => [r.label, r.detail ?? "-", fmt(r.count)])),
    labelledTable(t("reports.sensor.databases"), ["", t("reports.sensor.hits")], profile.databases.map((r) => [r.label, fmt(r.count)])),
    labelledTable(t("reports.sensor.scannedPorts"), ["", t("reports.sensor.hits")], profile.scannedPorts.map((r) => [r.label, fmt(r.count)])),
    labelledTable(t("reports.sensor.sourceServices"), ["", t("reports.sensor.hits")], profile.sourceServices.map((r) => [r.label, fmt(r.count)])),
    labelledTable(t("reports.sensor.signals"), ["", t("reports.sensor.hits")], profile.topSignals.map((r) => [r.label, fmt(r.count)])),
    labelledTable(t("reports.sensor.targets"), ["", t("reports.sensor.hits")], profile.topTargets.map((r) => [r.label, fmt(r.count)])),
  ].filter((block): block is NonNullable<typeof block> => block !== null)

  const title = `${sensor.name} — ${protocolLabel(sensor.protocol)}`
  const subtitle = [
    sensor.sensorId,
    `IP ${sensor.ip}`,
    sensor.ports.length > 0 ? `${t("reports.sensor.ports")} ${sensor.ports.join(", ")}` : null,
    sensor.online ? t("reports.fleet.online.yes") : t("reports.fleet.online.no"),
    `${t("reports.fleet.lastSeen")} ${sensor.lastSeen.slice(0, 16).replace("T", " ")}`,
  ].filter(Boolean).join(" · ")

  return (
    <Section title={title} subtitle={subtitle}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label={t("reports.kpi.events")} value={fmt(sensor.eventsTotal)} meta={`${profile.eventShare.toFixed(1)}%`} />
        <Kpi label={t("reports.kpi.uniqueIps")} value={fmt(profile.uniqueIps)} />
        <Kpi label={t("reports.sensor.auth")} value={fmt(profile.authAttempts)} meta={rate(profile.successCount, profile.authAttempts)} />
        <Kpi label={t("reports.sensor.commands")} value={fmt(profile.commandCount)} />
        <Kpi label={t("reports.sensor.malware")} value={fmt(profile.malwareCount)} />
      </div>

      {(profile.dailyActivity.length > 1 || profile.hourlyActivity.length > 0) && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <DailyBars data={profile.dailyActivity} label={t("reports.sensor.daily")} />
          <HourHeatmap data={profile.hourlyActivity} label={t("reports.sensor.hourly")} />
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {attackerRows.rows.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.sensor.topAttackers")}</p>
            <Table headers={attackerRows.headers} rows={attackerRows.rows} />
          </div>
        )}
        {profile.eventBreakdown.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.sensor.eventTypes")}</p>
            <Bars items={profile.eventBreakdown.slice(0, 6).map((e) => ({ label: e.label, value: e.count }))} />
          </div>
        )}
      </div>

      {profile.topCredentials.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.creds.topPairs")}</p>
          <Table
            headers={[t("reports.creds.username"), t("reports.creds.password"), t("reports.creds.attempts"), t("reports.creds.successes")]}
            rows={profile.topCredentials.map((c) => [c.username ?? "-", c.password ?? "-", fmt(c.attempts), fmt(c.successCount)])}
          />
        </div>
      )}

      {intel.length > 0 && (
        <div className="mt-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("reports.sensor.protocolIntel")}
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            {intel.map((block) => (
              <div key={block.label}>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{block.label}</p>
                <Table headers={block.headers} rows={block.rows} />
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.recentMalware.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("reports.sensor.malware")}</p>
          <Table
            headers={[t("reports.sensor.type"), t("reports.sensor.size"), t("reports.sensor.source"), "IP"]}
            rows={profile.recentMalware.slice(0, 8).map((m) => [
              m.fileType,
              formatBytes(m.size),
              m.source?.toUpperCase() ?? "-",
              m.srcIp ?? "-",
            ])}
          />
        </div>
      )}
    </Section>
  )
}
