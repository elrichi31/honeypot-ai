import React from "react"
import type { ClientReportData } from "../types"
import { s, SimpleTable } from "../shared/pdf-ui"
import { HorizontalBarChart } from "../shared/pdf-charts"
import { Text, View } from "@react-pdf/renderer"
import { fmt } from "../shared/format"

function trunc(str: string, max = 20): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str
}

export function ProtocolIntelligence({ profile }: { profile: ClientReportData["sensors"][number] }) {
  const hasSmb = profile.smbShares.length > 0 || profile.smbDomains.length > 0 || profile.smbHosts.length > 0 || profile.smbNtlmHashes.length > 0
  const hasFtp = profile.ftpCommands.length > 0 || profile.fileTransfers.length > 0
  const hasScans = profile.scannedPorts.length > 0
  const hasSourcePorts = profile.sourcePorts.length > 0
  const hasSourceServices = profile.sourceServices.length > 0
  const hasDatabases = profile.databases.length > 0
  const hasSuricata = profile.suricataAlerts.length > 0
  const hasFingerprints = profile.sshFingerprints.length > 0
  const hasCreds = profile.credentialCampaigns.length > 0
  const hasPersistent = profile.persistentAttackers.length > 0

  const hasAny = hasSmb || hasFtp || hasScans || hasSourcePorts || hasSourceServices
    || hasDatabases || hasSuricata || hasFingerprints || hasCreds || hasPersistent
  if (!hasAny) return null

  type Block =
    | { kind: "bar"; title: string; data: { label: string; count: number }[] }
    | { kind: "table"; title: string; headers: string[]; rows: string[][]; widths: string[] }

  const blocks: Block[] = []

  // ── Threat detection (Suricata) ────────────────────────────────────────────
  if (hasSuricata) {
    blocks.push({
      kind: "table", title: "IDS Alerts (Suricata)",
      headers: ["Signature", "Cat", "Sev", "Hits"],
      rows: profile.suricataAlerts.slice(0, 5).map((r) => [
        trunc(r.signature.replace(/^ET\s+\w+\s+/, ""), 22),
        trunc(r.category.split(" ")[0], 10),
        String(r.severity),
        fmt(r.count),
      ]),
      widths: ["48%", "24%", "10%", "18%"],
    })
  }

  // ── SSH fingerprints ───────────────────────────────────────────────────────
  if (hasFingerprints) {
    blocks.push({
      kind: "table", title: "SSH Client Fingerprints",
      headers: ["Client / Tool", "Sessions", "Logins"],
      rows: profile.sshFingerprints.slice(0, 5).map((r) => [
        trunc(r.clientVersion.replace("SSH-2.0-", ""), 22),
        fmt(r.sessions),
        fmt(r.successes),
      ]),
      widths: ["52%", "24%", "24%"],
    })
  }

  // ── Protocol-specific: scans / ports ──────────────────────────────────────
  if (hasScans) {
    blocks.push({ kind: "bar", title: "Top Ports / Services", data: profile.scannedPorts.slice(0, 5).map((r) => ({ label: trunc(r.label, 20), count: r.count })) })
  } else if (hasSourcePorts) {
    blocks.push({ kind: "bar", title: "Source Ports", data: profile.sourcePorts.slice(0, 5).map((r) => ({ label: r.label, count: r.count })) })
  }

  if (hasSourceServices) {
    blocks.push({ kind: "bar", title: "Service Fingerprints", data: profile.sourceServices.slice(0, 5).map((r) => ({ label: trunc(r.label, 20), count: r.count })) })
  } else if (hasScans && hasSourcePorts) {
    blocks.push({ kind: "bar", title: "Source Ports", data: profile.sourcePorts.slice(0, 5).map((r) => ({ label: r.label, count: r.count })) })
  }

  // ── SMB ───────────────────────────────────────────────────────────────────
  if (profile.smbDomains.length > 0) {
    blocks.push({ kind: "bar", title: "SMB Domains", data: profile.smbDomains.slice(0, 5).map((r) => ({ label: trunc(r.label, 20), count: r.count })) })
  }
  if (profile.smbShares.length > 0) {
    blocks.push({ kind: "bar", title: "SMB Shares", data: profile.smbShares.slice(0, 5).map((r) => ({ label: trunc(r.label, 20), count: r.count })) })
  }
  if (profile.smbNtlmHashes.length > 0) {
    blocks.push({
      kind: "table", title: "NTLM Hashes",
      headers: ["Hash (partial)", "User", "Hits"],
      rows: profile.smbNtlmHashes.slice(0, 4).map((r) => [trunc(r.label ?? "-", 18), trunc(r.detail ?? "-", 12), fmt(r.count)]),
      widths: ["44%", "30%", "26%"],
    })
  }
  if (profile.smbHosts.length > 0) {
    blocks.push({
      kind: "table", title: "SMB Hosts / OS",
      headers: ["Host", "Domain", "Hits"],
      rows: profile.smbHosts.slice(0, 4).map((r) => [trunc(r.label, 16), trunc(r.detail ?? "-", 14), fmt(r.count)]),
      widths: ["40%", "36%", "24%"],
    })
  }

  // ── FTP ───────────────────────────────────────────────────────────────────
  if (hasFtp && profile.ftpCommands.length > 0) {
    blocks.push({ kind: "bar", title: "FTP Commands", data: profile.ftpCommands.slice(0, 5).map((r) => ({ label: r.label, count: r.count })) })
  }
  if (hasFtp && profile.fileTransfers.length > 0) {
    blocks.push({
      kind: "table", title: "File Transfers",
      headers: ["Path / File", "Context", "Hits"],
      rows: profile.fileTransfers.slice(0, 4).map((r) => [trunc(r.label, 18), trunc(r.detail ?? "-", 14), fmt(r.count)]),
      widths: ["40%", "36%", "24%"],
    })
  }

  // ── Databases ─────────────────────────────────────────────────────────────
  if (hasDatabases) {
    blocks.push({ kind: "bar", title: "Targeted Databases", data: profile.databases.slice(0, 5).map((r) => ({ label: trunc(r.label, 20), count: r.count })) })
  }

  // ── Credential campaigns ──────────────────────────────────────────────────
  if (hasCreds) {
    blocks.push({
      kind: "table", title: "Active Credential Campaigns",
      headers: ["Username", "Password", "Attempts", "IPs"],
      rows: profile.credentialCampaigns.slice(0, 5).map((r) => [
        trunc(r.username ?? "-", 16),
        trunc(r.password ?? "-", 14),
        fmt(r.attempts),
        fmt(r.ips),
      ]),
      widths: ["30%", "28%", "22%", "20%"],
    })
  }

  // ── Persistent attackers ──────────────────────────────────────────────────
  if (hasPersistent) {
    blocks.push({
      kind: "table", title: "Persistent Attackers",
      headers: ["IP", "Days Active", "Total Hits"],
      rows: profile.persistentAttackers.slice(0, 5).map((r) => [
        r.ip,
        String(r.activeDays),
        fmt(r.totalHits),
      ]),
      widths: ["44%", "28%", "28%"],
    })
  }

  // Cap at 6 blocks = 3 rows of 2
  const visible = blocks.slice(0, 6)
  const rows: Block[][] = []
  for (let i = 0; i < visible.length; i += 2) rows.push(visible.slice(i, i + 2))

  return (
    <>
      <Text style={[s.panelTitle, { marginTop: 4, marginBottom: 4 }]}>Protocol Intelligence</Text>
      {rows.map((pair, ri) => (
        <View key={ri} style={[s.twoCol, { marginBottom: 4 }]}>
          {pair.map((block, bi) => (
            <View key={bi} style={s.col}>
              {block.kind === "bar" ? (
                <HorizontalBarChart data={block.data} width={255} maxBars={5} title={block.title} />
              ) : (
                <>
                  <Text style={[s.panelTitle, { marginBottom: 3 }]}>{block.title}</Text>
                  <SimpleTable headers={block.headers} rows={block.rows} widths={block.widths} />
                </>
              )}
            </View>
          ))}
          {pair.length === 1 && <View style={s.col} />}
        </View>
      ))}
    </>
  )
}
