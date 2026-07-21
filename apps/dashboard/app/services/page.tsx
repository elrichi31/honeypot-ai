import type { Metadata } from "next"
import { fetchProtocolStats, fetchProtocolHits, fetchTargetPortStats } from "@/lib/api"
import { PageShell } from "@/components/page-shell"
import { Network, Clock, Key } from "lucide-react"
import { ProtocolHitsTable } from "./protocol-hits-table"
import { SectionError } from "@/components/section-error"
import { Surface } from "@/components/ui/surface"
import { TableCard, EmptyRow } from "@/components/ui/table-card"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { readConfig } from "@/lib/server-config"
import { formatInTimezone } from "@/lib/timezone"
import { parsePage } from "@/lib/utils"
import { effectiveSensorScope } from "@/lib/tenant-scope"

const PROTOCOL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ftp: { bg: "bg-yellow-400/10", text: "text-yellow-400", border: "border-yellow-400/30" },
  mysql: { bg: "bg-purple-400/10", text: "text-purple-400", border: "border-purple-400/30" },
  "port-scan": { bg: "bg-blue-400/10", text: "text-blue-400", border: "border-blue-400/30" },
  dionaea: { bg: "bg-red-400/10", text: "text-red-400", border: "border-red-400/30" },
  smb: { bg: "bg-orange-400/10", text: "text-orange-400", border: "border-orange-400/30" },
  mssql: { bg: "bg-pink-400/10", text: "text-pink-400", border: "border-pink-400/30" },
  rpc: { bg: "bg-indigo-400/10", text: "text-indigo-400", border: "border-indigo-400/30" },
  tftp: { bg: "bg-lime-400/10", text: "text-lime-400", border: "border-lime-400/30" },
  mqtt: { bg: "bg-teal-400/10", text: "text-teal-400", border: "border-teal-400/30" },
}

function defaultColor() {
  return { bg: "bg-slate-400/10", text: "text-slate-400", border: "border-slate-400/30" }
}

export const metadata: Metadata = {
  title: "Services — HoneyTrap",
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; protocol?: string }>
}) {
  const params = await searchParams
  const page = parsePage(params.page)
  const protocol = params.protocol || undefined

  const config = readConfig()
  const tz = config.timezone ?? process.env.DASHBOARD_TIMEZONE ?? "UTC"
  const formatDate = (d: string) =>
    formatInTimezone(d, tz, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })

  const { sensorIds } = await effectiveSensorScope()

  let stats, portStats, hitsPage
  try {
    [stats, portStats, hitsPage] = await Promise.all([
      fetchProtocolStats(sensorIds),
      fetchTargetPortStats(sensorIds),
      fetchProtocolHits({ page, limit: 50, protocol }, sensorIds),
    ])
  } catch {
    return (
      <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Network Honeypots</h1>
        </div>
        <SectionError />
      </PageShell>
    )
  }

  const totalHits = stats.reduce((sum, s) => sum + s.count, 0)

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Network Honeypots</h1>
        <p className="text-sm text-muted-foreground">
          {totalHits.toLocaleString()} events captured across {stats.length} protocol{stats.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Stats cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => {
          const c = PROTOCOL_COLORS[s.protocol] ?? defaultColor()
          return (
            <Surface key={s.protocol} padded className={c.border}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {s.protocol}
                  </p>
                  <p className={`text-3xl font-bold ${c.text}`}>{s.count.toLocaleString()}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">total events</p>
                </div>
                <div className={`rounded-lg p-2 ${c.bg}`}>
                  <Network className={`h-5 w-5 ${c.text}`} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Key className="h-3 w-3" />
                  {s.authAttempts.toLocaleString()} auth attempts
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(s.lastSeen)}
                </span>
              </div>
            </Surface>
          )
        })}
      </div>

      {/* Target ports */}
      <TableCard className="mb-6">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Target ports</h2>
          <p className="text-xs text-muted-foreground">Destination ports currently receiving attacks</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dst Port</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Auth Attempts</TableHead>
              <TableHead>Last Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {portStats.length === 0 ? (
              <EmptyRow colSpan={5}>No target ports captured yet</EmptyRow>
            ) : (
              portStats.slice(0, 12).map((s) => {
                const c = PROTOCOL_COLORS[s.protocol] ?? defaultColor()
                return (
                  <TableRow key={`${s.protocol}-${s.dstPort}`}>
                    <TableCell className="font-mono text-sm font-semibold text-foreground">{s.dstPort}</TableCell>
                    <TableCell>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${c.bg} ${c.text}`}>
                        {s.protocol}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{s.count.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.authAttempts.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(s.lastSeen)}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </TableCard>

      {/* Protocol filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <a
          href="/services"
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${!protocol ? "border-foreground/40 bg-foreground/10 text-foreground" : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}
        >
          All
        </a>
        {stats.map((s) => {
          const c = PROTOCOL_COLORS[s.protocol] ?? defaultColor()
          const active = protocol === s.protocol
          return (
            <a
              key={s.protocol}
              href={`/services?protocol=${s.protocol}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? `${c.border} ${c.bg} ${c.text}` : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}
            >
              {s.protocol}
            </a>
          )
        })}
      </div>

      {/* Hits table */}
      <ProtocolHitsTable
        hits={hitsPage.data}
        meta={hitsPage.meta}
        protocol={protocol}
      />
    </PageShell>
  )
}
