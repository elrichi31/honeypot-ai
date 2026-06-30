import React from "react"
import type { ClientReportData } from "../types"
import { s, SimpleTable } from "../shared/pdf-ui"
import { Text, View } from "@react-pdf/renderer"
import { fmt } from "../shared/format"

export function ProtocolIntelligence({ profile }: { profile: ClientReportData["sensors"][number] }) {
  const blocks: Array<{ title: string; headers: [string, string]; rows: string[][] }> = []
  if (profile.scannedPorts.length > 0)
    blocks.push({ title: "Scanned Ports / Services", headers: ["Port / Service", "Hits"], rows: profile.scannedPorts.map((i) => [i.label, fmt(i.count)]) })
  if (profile.ftpCommands.length > 0)
    blocks.push({ title: "FTP Commands", headers: ["Command", "Count"], rows: profile.ftpCommands.map((i) => [i.label, fmt(i.count)]) })
  if (profile.smbShares.length > 0)
    blocks.push({ title: "Targeted SMB Shares", headers: ["Share", "Hits"], rows: profile.smbShares.map((i) => [i.label, fmt(i.count)]) })
  if (profile.databases.length > 0)
    blocks.push({ title: "Accessed Databases", headers: ["Database", "Hits"], rows: profile.databases.map((i) => [i.label, fmt(i.count)]) })

  if (blocks.length === 0) return null

  return (
    <>
      <Text style={[s.panelTitle, { marginTop: 6 }]}>Protocol Intelligence</Text>
      <View style={s.twoCol}>
        {blocks.map((block, index) => (
          <View key={index} style={s.col}>
            <SimpleTable headers={block.headers} rows={block.rows} widths={["72%", "28%"]} />
          </View>
        ))}
      </View>
    </>
  )
}
