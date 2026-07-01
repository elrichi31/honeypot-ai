import React from "react"
import type { ClientReportData } from "../types"
import { s, SimpleTable } from "../shared/pdf-ui"
import { HorizontalBarChart } from "../shared/pdf-charts"
import { Text, View } from "@react-pdf/renderer"
import { fmt } from "../shared/format"

function tableRows(
  rows: Array<{ label: string; count: number; detail?: string | null }>,
  formatter?: (row: { label: string; count: number; detail?: string | null }) => string[],
) {
  return rows.map((row) => formatter ? formatter(row) : [row.label, fmt(row.count)])
}

function trunc(str: string, max = 22): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str
}

export function ProtocolIntelligence({ profile }: { profile: ClientReportData["sensors"][number] }) {
  const summary: string[] = []
  if (profile.scannedPorts.length > 0) {
    summary.push(
      `${fmt(profile.scannedPorts.reduce((sum, r) => sum + r.count, 0))} scan hits touched ${fmt(profile.scannedPorts.length)} high-volume destination ports.`,
    )
    if (profile.sourceServices.length > 0) {
      summary.push(`${fmt(profile.sourceServices.length)} distinct service fingerprints were parsed from the incoming probes.`)
    }
  }
  if (profile.ftpCommands.length > 0 || profile.fileTransfers.length > 0) {
    summary.push(`${fmt(profile.authAttempts)} FTP auth attempts and ${fmt(profile.commandCount)} command events were captured in this period.`)
    if (profile.fileTransfers.length > 0) {
      summary.push(`${fmt(profile.fileTransfers.reduce((sum, r) => sum + r.count, 0))} file transfer events were recorded, useful for spotting payload staging.`)
    }
  }
  if (profile.smbShares.length > 0 || profile.smbDomains.length > 0 || profile.smbNtlmHashes.length > 0) {
    summary.push(`${fmt(profile.authAttempts)} SMB auth attempts produced ${fmt(profile.smbShares.length)} frequently targeted share names and ${fmt(profile.smbDomains.length)} observed domains/workgroups.`)
    if (profile.smbNtlmHashes.length > 0) {
      summary.push(`${fmt(profile.smbNtlmHashes.reduce((sum, r) => sum + r.count, 0))} NTLM hash captures indicate credential material suitable for offline cracking.`)
    }
  }

  const hasSmb = profile.smbShares.length > 0 || profile.smbDomains.length > 0 || profile.smbHosts.length > 0 || profile.smbNtlmHashes.length > 0
  const hasFtp = profile.ftpCommands.length > 0 || profile.fileTransfers.length > 0
  const hasScans = profile.scannedPorts.length > 0
  const hasSourcePorts = profile.sourcePorts.length > 0
  const hasSourceServices = profile.sourceServices.length > 0
  const hasDatabases = profile.databases.length > 0

  if (!hasSmb && !hasFtp && !hasScans && !hasSourcePorts && !hasSourceServices && !hasDatabases && summary.length === 0) return null

  return (
    <>
      <Text style={[s.panelTitle, { marginTop: 6 }]}>Protocol Intelligence</Text>
      {summary.map((line, i) => (
        <Text key={i} style={[s.bodyText, { marginBottom: 4 }]}>{line}</Text>
      ))}

      {/* Scan ports + service fingerprints */}
      {(hasScans || hasSourcePorts || hasSourceServices) && (
        <View style={[s.twoCol, { marginBottom: 6 }]}>
          <View style={s.col}>
            {hasScans && (
              <HorizontalBarChart
                data={profile.scannedPorts.slice(0, 8).map((r) => ({ label: trunc(r.label, 22), count: r.count }))}
                width={255} maxBars={8} title="Top Services / Ports"
              />
            )}
            {!hasScans && hasSourcePorts && (
              <HorizontalBarChart
                data={profile.sourcePorts.slice(0, 8).map((r) => ({ label: r.label, count: r.count }))}
                width={255} maxBars={8} title="Top Source Ports"
              />
            )}
          </View>
          <View style={s.col}>
            {hasSourceServices && (
              <HorizontalBarChart
                data={profile.sourceServices.slice(0, 8).map((r) => ({ label: trunc(r.label, 22), count: r.count }))}
                width={255} maxBars={8} title="Service Fingerprints"
              />
            )}
            {hasScans && hasSourcePorts && !hasSourceServices && (
              <HorizontalBarChart
                data={profile.sourcePorts.slice(0, 8).map((r) => ({ label: r.label, count: r.count }))}
                width={255} maxBars={8} title="Top Source Ports"
              />
            )}
          </View>
        </View>
      )}

      {/* SMB: domains + shares as bar charts, hosts + hashes as compact tables */}
      {hasSmb && (
        <>
          {(profile.smbDomains.length > 0 || profile.smbShares.length > 0) && (
            <View style={[s.twoCol, { marginBottom: 6 }]}>
              <View style={s.col}>
                {profile.smbDomains.length > 0 && (
                  <HorizontalBarChart
                    data={profile.smbDomains.slice(0, 6).map((r) => ({ label: trunc(r.label, 20), count: r.count }))}
                    width={255} maxBars={6} title="SMB Domains / Workgroups"
                  />
                )}
              </View>
              <View style={s.col}>
                {profile.smbShares.length > 0 && (
                  <HorizontalBarChart
                    data={profile.smbShares.slice(0, 6).map((r) => ({ label: trunc(r.label, 20), count: r.count }))}
                    width={255} maxBars={6} title="Targeted SMB Shares"
                  />
                )}
              </View>
            </View>
          )}
          {(profile.smbHosts.length > 0 || profile.smbNtlmHashes.length > 0) && (
            <View style={[s.twoCol, { marginBottom: 6 }]}>
              <View style={s.col}>
                {profile.smbHosts.length > 0 && (
                  <>
                    <Text style={[s.panelTitle, { marginBottom: 4 }]}>Client Hostnames / OS</Text>
                    <SimpleTable
                      headers={["Host / OS", "Domain", "Hits"]}
                      rows={profile.smbHosts.slice(0, 6).map((r) => [trunc(r.label, 16), trunc(r.detail ?? "-", 14), fmt(r.count)])}
                      widths={["40%", "36%", "24%"]}
                    />
                  </>
                )}
              </View>
              <View style={s.col}>
                {profile.smbNtlmHashes.length > 0 && (
                  <>
                    <Text style={[s.panelTitle, { marginBottom: 4 }]}>Captured NTLM Hashes</Text>
                    <SimpleTable
                      headers={["Hash (partial)", "User", "Hits"]}
                      rows={profile.smbNtlmHashes.slice(0, 6).map((r) => [trunc(r.label ?? "-", 18), trunc(r.detail ?? "-", 12), fmt(r.count)])}
                      widths={["44%", "30%", "26%"]}
                    />
                  </>
                )}
              </View>
            </View>
          )}
        </>
      )}

      {/* FTP: commands as bar chart, file transfers as table */}
      {hasFtp && (
        <View style={[s.twoCol, { marginBottom: 6 }]}>
          <View style={s.col}>
            {profile.ftpCommands.length > 0 && (
              <HorizontalBarChart
                data={profile.ftpCommands.slice(0, 6).map((r) => ({ label: r.label, count: r.count }))}
                width={255} maxBars={6} title="FTP Command Mix"
              />
            )}
          </View>
          <View style={s.col}>
            {profile.fileTransfers.length > 0 && (
              <>
                <Text style={[s.panelTitle, { marginBottom: 4 }]}>File Transfer Activity</Text>
                <SimpleTable
                  headers={["Path / File", "Context", "Hits"]}
                  rows={tableRows(profile.fileTransfers.slice(0, 6), (r) => [trunc(r.label, 18), trunc(r.detail ?? "-", 16), fmt(r.count)])}
                  widths={["40%", "36%", "24%"]}
                />
              </>
            )}
          </View>
        </View>
      )}

      {/* Databases */}
      {hasDatabases && (
        <View style={[s.twoCol, { marginBottom: 6 }]}>
          <View style={s.col}>
            <HorizontalBarChart
              data={profile.databases.slice(0, 6).map((r) => ({ label: trunc(r.label, 22), count: r.count }))}
              width={255} maxBars={6} title="Targeted Databases"
            />
          </View>
          <View style={s.col} />
        </View>
      )}
    </>
  )
}
