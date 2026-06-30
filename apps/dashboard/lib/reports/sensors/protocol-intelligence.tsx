import React from "react"
import type { ClientReportData } from "../types"
import { s, SimpleTable } from "../shared/pdf-ui"
import { Text, View } from "@react-pdf/renderer"
import { fmt } from "../shared/format"

function tableRows(
  rows: Array<{ label: string; count: number; detail?: string | null }>,
  formatter?: (row: { label: string; count: number; detail?: string | null }) => string[],
) {
  return rows.map((row) => formatter ? formatter(row) : [row.label, fmt(row.count)])
}

export function ProtocolIntelligence({ profile }: { profile: ClientReportData["sensors"][number] }) {
  const blocks: Array<{
    title: string
    headers: string[]
    widths: [string, string] | [string, string, string]
    rows: string[][]
  }> = []

  if (profile.eventBreakdown.length > 0) {
    blocks.push({
      title: "Activity Breakdown",
      headers: ["Event Type", "Hits"],
      widths: ["72%", "28%"],
      rows: tableRows(profile.eventBreakdown),
    })
  }

  if (profile.scannedPorts.length > 0) {
    blocks.push({
      title: "Most Targeted Ports",
      headers: ["Port / Service", "Hits"],
      widths: ["72%", "28%"],
      rows: tableRows(profile.scannedPorts),
    })
  }

  if (profile.sourceServices.length > 0) {
    blocks.push({
      title: "Service Fingerprints",
      headers: ["Fingerprint", "Hits"],
      widths: ["72%", "28%"],
      rows: tableRows(profile.sourceServices),
    })
  }

  if (profile.sourcePorts.length > 0) {
    blocks.push({
      title: "Top Source Ports",
      headers: ["Source Port", "Hits"],
      widths: ["72%", "28%"],
      rows: tableRows(profile.sourcePorts),
    })
  }

  if (profile.ftpCommands.length > 0) {
    blocks.push({
      title: "FTP Command Mix",
      headers: ["Command", "Count"],
      widths: ["72%", "28%"],
      rows: tableRows(profile.ftpCommands),
    })
  }

  if (profile.fileTransfers.length > 0) {
    blocks.push({
      title: "File Transfer Activity",
      headers: ["Path / File", "Context", "Hits"],
      widths: ["44%", "34%", "22%"],
      rows: tableRows(profile.fileTransfers, (row) => [row.label, row.detail ?? "-", fmt(row.count)]),
    })
  }

  if (profile.smbDomains.length > 0) {
    blocks.push({
      title: "SMB Domains / Workgroups",
      headers: ["Domain", "Hits"],
      widths: ["72%", "28%"],
      rows: tableRows(profile.smbDomains),
    })
  }

  if (profile.smbShares.length > 0) {
    blocks.push({
      title: "Targeted SMB Shares",
      headers: ["Share", "Hits"],
      widths: ["72%", "28%"],
      rows: tableRows(profile.smbShares),
    })
  }

  if (profile.smbHosts.length > 0) {
    blocks.push({
      title: "Client Hostnames / OS",
      headers: ["Host / OS", "Domain", "Hits"],
      widths: ["42%", "34%", "24%"],
      rows: tableRows(profile.smbHosts, (row) => [row.label, row.detail ?? "-", fmt(row.count)]),
    })
  }

  if (profile.smbNtlmHashes.length > 0) {
    blocks.push({
      title: "Captured NTLM Hashes",
      headers: ["Hash", "Username", "Hits"],
      widths: ["46%", "28%", "26%"],
      rows: tableRows(profile.smbNtlmHashes, (row) => [row.label, row.detail ?? "-", fmt(row.count)]),
    })
  }

  if (profile.databases.length > 0) {
    blocks.push({
      title: "Targeted Databases",
      headers: ["Database", "Hits"],
      widths: ["72%", "28%"],
      rows: tableRows(profile.databases),
    })
  }

  const summary: string[] = []
  if (profile.scannedPorts.length > 0) {
    summary.push(
      `${fmt(profile.scannedPorts.reduce((sum, row) => sum + row.count, 0))} scan hits touched ${fmt(profile.scannedPorts.length)} high-volume destination ports.`,
    )
    if (profile.sourceServices.length > 0) {
      summary.push(`${fmt(profile.sourceServices.length)} distinct service fingerprints were parsed from the incoming probes.`)
    }
  }
  if (profile.ftpCommands.length > 0 || profile.fileTransfers.length > 0) {
    summary.push(`${fmt(profile.authAttempts)} FTP auth attempts and ${fmt(profile.commandCount)} command events were captured in this period.`)
    if (profile.fileTransfers.length > 0) {
      summary.push(`${fmt(profile.fileTransfers.reduce((sum, row) => sum + row.count, 0))} file transfer events were recorded, useful for spotting payload staging.`)
    }
  }
  if (profile.smbShares.length > 0 || profile.smbDomains.length > 0 || profile.smbNtlmHashes.length > 0) {
    summary.push(`${fmt(profile.authAttempts)} SMB auth attempts produced ${fmt(profile.smbShares.length)} frequently targeted share names and ${fmt(profile.smbDomains.length)} observed domains/workgroups.`)
    if (profile.smbNtlmHashes.length > 0) {
      summary.push(`${fmt(profile.smbNtlmHashes.reduce((sum, row) => sum + row.count, 0))} NTLM hash captures indicate credential material suitable for offline cracking attempts.`)
    }
  }

  if (blocks.length === 0 && summary.length === 0) return null

  return (
    <>
      <Text style={[s.panelTitle, { marginTop: 6 }]}>Protocol Intelligence</Text>
      {summary.map((line, index) => (
        <Text key={index} style={[s.bodyText, { marginBottom: 4 }]}>
          {line}
        </Text>
      ))}
      <View style={s.twoCol}>
        {blocks.map((block, index) => (
          <View key={index} style={s.col}>
            <Text style={[s.panelTitle, { marginBottom: 4 }]}>{block.title}</Text>
            <SimpleTable headers={block.headers} rows={block.rows} widths={block.widths} />
          </View>
        ))}
      </View>
    </>
  )
}
