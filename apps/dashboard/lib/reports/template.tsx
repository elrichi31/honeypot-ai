// Server-only: React-PDF document component.
import React from "react"
import { Document, Page } from "@react-pdf/renderer"
import type { ClientReportData } from "./types"
import { Footer, s, type T } from "./shared/pdf-ui"
import { SensorPage } from "./sensors/sensor-page"
import { ExecutiveSummaryPage } from "./sections/executive-summary"
import { ThreatSummarySection } from "./sections/threat-summary"
import { CredentialsSummarySection } from "./sections/credentials-summary"
import { SshSummarySection } from "./sections/ssh-summary"
import { WebSummarySection } from "./sections/web-summary"

export function ReportDocument({ data, t }: { data: ClientReportData; t: T }) {
  return (
    <Document title={`Security Report - ${data.meta.clientName}`} author="HoneyTrap Platform">
      <Page size="A4" style={s.page}>
        <ExecutiveSummaryPage data={data} t={t} />
      </Page>

      <Page size="A4" style={s.page}>
        <SshSummarySection data={data} t={t} />
        <ThreatSummarySection data={data} t={t} />
        <CredentialsSummarySection data={data} t={t} />
        <WebSummarySection data={data} title={t("reports.section.web")} />
        <Footer data={data} t={t} />
      </Page>

      {data.sensors.map((profile) => (
        <Page key={profile.sensor.sensorId} size="A4" style={s.page}>
          <SensorPage profile={profile} t={t} />
          <Footer data={data} t={t} />
        </Page>
      ))}
    </Document>
  )
}
