import Link from "next/link"
import { ArrowLeft, Clock, Fingerprint, Key, Network } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { StatCard } from "@/components/stat-card"
import type { ProtocolHit, ProtocolInsights } from "@/lib/api"

type ProtocolKind = "ftp" | "mysql" | "port-scan"

const BADGES: Record<string, string> = {
  ftp: "bg-yellow-400/20 text-yellow-400",
  mysql: "bg-purple-400/20 text-purple-400",
  "port-scan": "bg-blue-400/20 text-blue-400",
  connect: "bg-slate-400/20 text-slate-400",
  auth: "bg-orange-400/20 text-orange-400",
  command: "bg-green-400/20 text-green-400",
}

const COPY: Record<ProtocolKind, { title: string; description: string }> = {
  ftp: {
    title: "FTP Honeypot",
    description: "Credential attempts, FTP commands, source IPs, and requested actions captured on the FTP service.",
  },
  mysql: {
    title: "MySQL Honeypot",
    description: "Database login probes, attempted usernames, source IPs, and target port activity.",
  },
  "port-scan": {
    title: "Port Scan Honeypot",
    description: "Connections to exposed decoy services, target ports, advertised service fingerprints, and raw payload hints.",
  },
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function dataValue(data: Record<string, unknown> | null | undefined, key: string) {
  const value = data?.[key]
  return typeof value === "string" && value ? value : null
}

function RankingCard({
  title,
  empty,
  rows,
}: {
  title: string
  empty: string
  rows: { label: string; detail?: string; count: number }[]
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y divide-border/40">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-foreground">{row.label}</p>
                {row.detail && <p className="text-[11px] text-muted-foreground">{row.detail}</p>}
              </div>
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                {row.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProtocolDetailPage({
  protocol,
  insights,
  hits,
}: {
  protocol: ProtocolKind
  insights: ProtocolInsights
  hits: ProtocolHit[]
}) {
  const copy = COPY[protocol]
  const isFtp = protocol === "ftp"
  const isMysql = protocol === "mysql"
  const isPortScan = protocol === "port-scan"

  return (
    <PageShell>
      <div className="mb-6">
        <Link href="/services" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Network Honeypots
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Network} label="Total events" value={insights.totals.total.toLocaleString()} color="text-cyan-400" bg="bg-cyan-400/10" />
        <StatCard icon={Fingerprint} label="Unique IPs" value={insights.totals.uniqueIps.toLocaleString()} color="text-emerald-400" bg="bg-emerald-400/10" />
        <StatCard icon={Key} label="Auth attempts" value={insights.totals.authAttempts.toLocaleString()} color="text-orange-400" bg="bg-orange-400/10" />
        <StatCard icon={Clock} label="Last seen" value={formatDate(insights.totals.lastSeen)} color="text-slate-300" bg="bg-slate-400/10" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RankingCard
          title="Top source IPs"
          empty="No source IPs captured yet"
          rows={insights.topIps.map((row) => ({
            label: row.srcIp,
            detail: `Last seen ${formatDate(row.lastSeen)}`,
            count: row.count,
          }))}
        />
        <RankingCard
          title="Target ports"
          empty="No target ports captured yet"
          rows={insights.topPorts.map((row) => ({
            label: String(row.dstPort),
            detail: `Last seen ${formatDate(row.lastSeen)}`,
            count: row.count,
          }))}
        />
        {isPortScan ? (
          <RankingCard
            title="Detected services"
            empty="No service fingerprints captured yet"
            rows={insights.topServices.map((row) => ({ label: row.service, count: row.count }))}
          />
        ) : (
          <RankingCard
            title="Attempted usernames"
            empty="No usernames captured yet"
            rows={insights.topUsernames.map((row) => ({ label: row.username, count: row.count }))}
          />
        )}
      </div>

      {(isFtp || isMysql) && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RankingCard
            title={isFtp ? "Attempted passwords" : "Attempted usernames"}
            empty={isFtp ? "No passwords captured yet" : "No usernames captured yet"}
            rows={isFtp
              ? insights.topPasswords.map((row) => ({ label: row.password, count: row.count }))
              : insights.topUsernames.map((row) => ({ label: row.username, count: row.count }))}
          />
          <RankingCard
            title={isFtp ? "FTP commands" : "Target databases"}
            empty={isFtp ? "No FTP commands captured yet" : "No database names captured yet"}
            rows={isFtp
              ? insights.topCommands.map((row) => ({ label: row.command, count: row.count }))
              : (insights.topDatabases ?? []).map((row) => ({ label: row.database, count: row.count }))}
          />
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Recent events</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Dst Port</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">
                  {isPortScan ? "Service / Payload" : isMysql ? "User / Database" : "User / Password or Command"}
                </th>
                <th className="px-4 py-3 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {hits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No events captured yet
                  </td>
                </tr>
              ) : (
                hits.map((hit) => {
                  const command = dataValue(hit.data, "command")
                  const service = dataValue(hit.data, "service")
                  const payloadHex = dataValue(hit.data, "payloadHex")
                  return (
                    <tr key={hit.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-mono text-xs">{hit.src_ip}:{hit.src_port ?? "-"}</td>
                      <td className="px-4 py-2 font-mono text-xs">{hit.dst_port}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${BADGES[hit.event_type] ?? "bg-slate-400/20 text-slate-400"}`}>
                          {hit.event_type}
                        </span>
                      </td>
                      <td className="max-w-[24rem] px-4 py-2">
                        {isPortScan ? (
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-foreground">{service ?? "unknown service"}</p>
                            {payloadHex && <p className="truncate font-mono text-[11px] text-muted-foreground">{payloadHex}</p>}
                          </div>
                        ) : isMysql ? (
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-foreground">{hit.username ?? "-"}</p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {dataValue(hit.data, "database") ?? "no db specified"}
                            </p>
                          </div>
                        ) : hit.event_type === "command" ? (
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-foreground">{command ?? "-"}</p>
                            {hit.username && (
                              <p className="font-mono text-[11px] text-muted-foreground">user: {hit.username}</p>
                            )}
                          </div>
                        ) : (
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-foreground">{hit.username ?? "-"}</p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">{hit.password ?? "-"}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{formatDate(hit.timestamp)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  )
}
