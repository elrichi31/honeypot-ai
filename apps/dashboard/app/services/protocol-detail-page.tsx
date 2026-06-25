import Link from "next/link"
import { ArrowLeft, Clock, Fingerprint, Key, Network } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { StatCard } from "@/components/stat-card"
import { readConfig } from "@/lib/server-config"
import { formatInTimezone } from "@/lib/timezone"
import type { ProtocolHit, ProtocolInsights } from "@/lib/api"
import { Surface } from "@/components/ui/surface"
import { TableCard, EmptyRow } from "@/components/ui/table-card"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"

export type ProtocolKind = "ftp" | "mysql" | "port-scan" | "smb" | "mssql" | "mqtt" | "tftp" | "rpc"

const BADGES: Record<string, string> = {
  ftp:        "bg-yellow-400/20 text-yellow-400",
  mysql:      "bg-purple-400/20 text-purple-400",
  "port-scan":"bg-blue-400/20 text-blue-400",
  smb:        "bg-orange-400/20 text-orange-400",
  mssql:      "bg-pink-400/20 text-pink-400",
  mqtt:       "bg-teal-400/20 text-teal-400",
  tftp:       "bg-lime-400/20 text-lime-400",
  rpc:        "bg-indigo-400/20 text-indigo-400",
  connect:    "bg-slate-400/20 text-slate-400",
  auth:       "bg-orange-400/20 text-orange-400",
  command:    "bg-green-400/20 text-green-400",
  "file.upload":   "bg-rose-400/20 text-rose-400",
  "file.download": "bg-cyan-400/20 text-cyan-400",
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
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
  smb: {
    title: "SMB Honeypot",
    description: "Windows file-sharing exploit attempts — EternalBlue, WannaCry, lateral movement, and payload drops on port 445.",
  },
  mssql: {
    title: "MSSQL Honeypot",
    description: "SQL Server login probes, credential stuffing, and xp_cmdshell execution attempts on port 1433.",
  },
  mqtt: {
    title: "MQTT Honeypot",
    description: "IoT broker attack traffic — botnet connections, topic subscriptions, and malicious publish attempts on port 1883.",
  },
  tftp: {
    title: "TFTP Honeypot",
    description: "Trivial FTP read/write requests — commonly used for firmware drops and lateral movement payloads.",
  },
  rpc: {
    title: "RPC / EPMAP Honeypot",
    description: "Windows RPC endpoint mapper probes and DCOM exploitation attempts on port 135.",
  },
}

function makeFormatDate(tz: string) {
  return (value: string | null | undefined) => {
    if (!value) return "-"
    return formatInTimezone(value, tz, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }
}

function dataValue(data: Record<string, unknown> | null | undefined, key: string) {
  const value = data?.[key]
  return typeof value === "string" && value ? value : null
}

function dataNumberValue(data: Record<string, unknown> | null | undefined, key: string) {
  const value = data?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function truncateMiddle(value: string, max = 96) {
  if (value.length <= max) return value
  const keep = Math.max(12, Math.floor((max - 3) / 2))
  return `${value.slice(0, keep)}...${value.slice(-keep)}`
}

function firstDataValue(data: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = dataValue(data, key)
    if (value) return value
  }
  return null
}

function aggregateRows(
  items: Array<{ label: string | null; detail?: string | null }>,
  limit = 10,
): { label: string; detail?: string; count: number }[] {
  const rows = new Map<string, { label: string; detail?: string; count: number }>()
  for (const item of items) {
    if (!item.label) continue
    const existing = rows.get(item.label)
    if (existing) {
      existing.count += 1
      if (!existing.detail && item.detail) existing.detail = item.detail
      continue
    }
    rows.set(item.label, {
      label: item.label,
      detail: item.detail ?? undefined,
      count: 1,
    })
  }
  return [...rows.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
}

function buildPortScanSummary(hit: ProtocolHit) {
  const service = dataValue(hit.data, "service") ?? "unknown service"
  const protocolName = dataValue(hit.data, "protocolName")
  const clientVersion = dataValue(hit.data, "clientVersion")
  const authType = dataValue(hit.data, "authType")
  const mstshash = dataValue(hit.data, "mstshash")
  const requestedSecurity = dataValue(hit.data, "requestedSecurity")
  const httpMethod = dataValue(hit.data, "httpMethod")
  const httpPath = dataValue(hit.data, "httpPath")
  const userAgent = dataValue(hit.data, "userAgent")
  const hostHeader = dataValue(hit.data, "hostHeader")
  const authorizationHeader = dataValue(hit.data, "authorizationHeader")
  const messageLength = dataNumberValue(hit.data, "messageLength")
  const requestId = dataNumberValue(hit.data, "requestId")
  const opCode = dataNumberValue(hit.data, "opCode")
  const targetNamespace = dataValue(hit.data, "targetNamespace")
  const payloadHex = dataValue(hit.data, "payloadHex")

  const title = protocolName ? `${service} (${protocolName})` : service
  const lines = [
    clientVersion && `client: ${clientVersion}`,
    authType && `auth: ${authType}`,
    mstshash && `user: ${mstshash}`,
    requestedSecurity && `sec: ${requestedSecurity}`,
    httpMethod && `${httpMethod} ${httpPath ?? "/"}`,
    hostHeader && `host: ${hostHeader}`,
    userAgent && `ua: ${truncateMiddle(userAgent, 88)}`,
    authorizationHeader && `authz: ${truncateMiddle(authorizationHeader, 88)}`,
    targetNamespace && `ns: ${targetNamespace}`,
    (messageLength !== null || requestId !== null || opCode !== null) &&
      `mongo len=${messageLength ?? "-"} req=${requestId ?? "-"} op=${opCode ?? "-"}`,
    hit.event_type === "auth" && hit.password && `pwd-resp: ${truncateMiddle(hit.password, 88)}`,
    !httpMethod && !targetNamespace && payloadHex && truncateMiddle(payloadHex, 88),
  ].filter(Boolean) as string[]

  return { title, lines }
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
    <Surface>
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
    </Surface>
  )
}

// Compact per-event-type counters (connect / auth / command / file.upload / …),
// so the mix of activity is visible at a glance without counting the table.
const EVENT_STYLE: Record<string, string> = {
  connect:         "text-slate-300",
  auth:            "text-orange-400",
  command:         "text-emerald-400",
  "file.upload":   "text-rose-400",
  "file.download": "text-cyan-400",
}

function EventBreakdown({ rows }: { rows: { eventType: string; count: number }[] }) {
  return (
    <Surface className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Event breakdown</h2>
      <div className="flex flex-wrap gap-3">
        {rows.map((row) => (
          <div key={row.eventType} className="flex items-baseline gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
            <span className={`font-mono text-sm font-bold ${EVENT_STYLE[row.eventType] ?? "text-foreground"}`}>
              {row.count.toLocaleString()}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">{row.eventType}</span>
          </div>
        ))}
      </div>
    </Surface>
  )
}

// Credential pairs actually tried together — far more useful for intel than two
// separate username/password lists (you see admin:admin123, root:123456, …).
function CredentialPairsCard({ rows }: { rows: { username: string; password: string; count: number }[] }) {
  return (
    <Surface>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Credential pairs</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No credential pairs captured yet</p>
      ) : (
        <div className="divide-y divide-border/40">
          {rows.map((row) => (
            <div key={`${row.username}:${row.password}`} className="flex items-center gap-3 px-4 py-2.5">
              <p className="min-w-0 flex-1 truncate font-mono text-xs">
                <span className="text-orange-300/90">{row.username || "∅"}</span>
                <span className="text-muted-foreground"> : </span>
                <span className="text-red-300/90">{row.password}</span>
              </p>
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                {row.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </Surface>
  )
}

function RecentUploadsCard({
  rows,
}: {
  rows: Array<{ path: string; share: string | null; size: number | null; sha256: string | null; srcIp: string; timestamp: string }>
}) {
  return (
    <Surface>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Recent file drops</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No SMB uploads captured yet</p>
      ) : (
        <div className="divide-y divide-border/40">
          {rows.map((row) => (
            <div key={`${row.timestamp}:${row.path}:${row.srcIp}`} className="px-4 py-3">
              <p className="truncate font-mono text-xs text-foreground" title={row.path}>{row.path}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {[
                  row.share ? `share: ${row.share}` : null,
                  row.size !== null ? formatBytes(row.size) : null,
                  row.sha256 ? `sha256: ${truncateMiddle(row.sha256, 28)}` : null,
                ].filter(Boolean).join(" · ")}
              </p>
              <p className="text-[11px] text-muted-foreground/80">{row.srcIp} · {row.timestamp}</p>
            </div>
          ))}
        </div>
      )}
    </Surface>
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
  const config = readConfig()
  const tz = config.timezone ?? process.env.DASHBOARD_TIMEZONE ?? "UTC"
  const formatDate = makeFormatDate(tz)

  const copy = COPY[protocol]
  const isFtp      = protocol === "ftp"
  const isMysql    = protocol === "mysql"
  const isPortScan = protocol === "port-scan"
  const isSmb      = protocol === "smb"
  const isMssql    = protocol === "mssql"
  const isMqtt     = protocol === "mqtt"
  const hasCredentials = isFtp || isMysql || isSmb || isMssql

  const smbUploadHits = isSmb
    ? hits
        .filter((hit) => hit.event_type === "file.upload")
        .map((hit) => ({
          path: firstDataValue(hit.data, ["requestedPath", "fileName", "command"]) ?? "(unknown path)",
          share: firstDataValue(hit.data, ["shareName", "share"]),
          size: dataNumberValue(hit.data, "fileSize") ?? dataNumberValue(hit.data, "size"),
          sha256: dataValue(hit.data, "sha256"),
          srcIp: hit.src_ip,
          timestamp: formatDate(hit.timestamp),
        }))
        .slice(0, 8)
    : []

  const smbShareRows = isSmb
    ? aggregateRows(
        hits.map((hit) => ({
          label: firstDataValue(hit.data, ["shareName", "share"]),
          detail: hit.username ? `last user: ${hit.username}` : null,
        })),
      )
    : []

  const smbPathRows = isSmb
    ? aggregateRows(
        hits
          .filter((hit) => hit.event_type === "file.upload" || hit.event_type === "file.download")
          .map((hit) => ({
            label: firstDataValue(hit.data, ["requestedPath", "fileName"]),
            detail: firstDataValue(hit.data, ["shareName", "share"]),
          })),
      )
    : []

  const smbHostRows = isSmb
    ? aggregateRows(
        hits.map((hit) => ({
          label: firstDataValue(hit.data, ["hostName", "nativeOS"]),
          detail: dataValue(hit.data, "domain"),
        })),
      )
    : []

  const smbDomainRows = isSmb
    ? (insights.topDomains?.length
        ? insights.topDomains.map((row) => ({ label: row.domain, count: row.count }))
        : aggregateRows(hits.map((hit) => ({ label: dataValue(hit.data, "domain") }))))
    : []

  const smbHasRichData = isSmb && (
    smbDomainRows.length > 0 ||
    smbShareRows.length > 0 ||
    smbPathRows.length > 0 ||
    smbHostRows.length > 0 ||
    smbUploadHits.length > 0 ||
    (insights.topNtlmHashes?.length ?? 0) > 0
  )

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

      {(insights.eventBreakdown?.length ?? 0) > 0 && (
        <div className="mb-6">
          <EventBreakdown rows={insights.eventBreakdown ?? []} />
        </div>
      )}

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
        ) : isMqtt ? (
          <RankingCard
            title="Topics"
            empty="No MQTT topics captured yet"
            rows={insights.topCommands.map((row) => ({ label: row.command, count: row.count }))}
          />
        ) : (
          <RankingCard
            title="Attempted usernames"
            empty="No usernames captured yet"
            rows={insights.topUsernames.map((row) => ({ label: row.username, count: row.count }))}
          />
        )}
      </div>

      {hasCredentials && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(insights.topCredentials?.length ?? 0) > 0 ? (
            <CredentialPairsCard rows={insights.topCredentials ?? []} />
          ) : (
            <RankingCard
              title="Attempted passwords"
              empty="No passwords captured yet"
              rows={insights.topPasswords.map((row) => ({ label: row.password, count: row.count }))}
            />
          )}
          <RankingCard
            title={isFtp ? "FTP commands" : isMysql ? "Target databases" : isSmb ? "SMB shares / paths" : "Commands"}
            empty="No data captured yet"
            rows={isFtp
              ? insights.topCommands.map((row) => ({ label: row.command, count: row.count }))
              : isMysql
              ? (insights.topDatabases ?? []).map((row) => ({ label: row.database, count: row.count }))
              : insights.topCommands.map((row) => ({ label: row.command, count: row.count }))}
          />
        </div>
      )}

      {/* SMB rich data — only shown when the Impacket sensor is active */}
      {smbHasRichData && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankingCard
              title="NTLM domains / workgroups"
              empty="No domains captured yet"
              rows={smbDomainRows}
            />
            <RankingCard
              title="Shares accessed"
              empty="No share access captured yet"
              rows={(insights.topShares?.length
                ? insights.topShares.map((row) => ({ label: row.share, count: row.count }))
                : smbShareRows)}
            />
          </div>
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankingCard
              title="Recent paths touched"
              empty="No SMB paths captured yet"
              rows={smbPathRows}
            />
            <RecentUploadsCard rows={smbUploadHits} />
          </div>
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankingCard
              title="Client hostnames / fingerprints"
              empty="No SMB hostname data captured yet"
              rows={(insights.topNativeOS?.length
                ? insights.topNativeOS.map((row) => ({ label: row.nativeOS, count: row.count }))
                : smbHostRows)}
            />
            <RankingCard
              title="NTLM hashes (crackable offline)"
              empty="No hashes captured yet"
              rows={(insights.topNtlmHashes ?? []).map((row) => ({
                label: row.ntlmHash,
                detail: row.username ? `user: ${row.username}` : undefined,
                count: row.count,
              }))}
            />
          </div>
        </>
      )}

      <TableCard>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Recent events</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Dst Port</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>
                {isPortScan ? "Service / Payload" : isMysql ? "User / Database" : isMqtt ? "Topic / Message" : isSmb ? "User / Domain / OS" : "User / Password"}
              </TableHead>
              <TableHead>Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hits.length === 0 ? (
              <EmptyRow colSpan={5}>No events captured yet</EmptyRow>
            ) : (
              hits.map((hit) => {
                const command = dataValue(hit.data, "command")
                const payloadHex = dataValue(hit.data, "payloadHex")
                const portSummary = isPortScan ? buildPortScanSummary(hit) : null
                // Enriched handshake fields captured by the protocol-aware port
                // handlers (VNC/RDP). Shown legibly instead of raw hex.
                const clientVersion = dataValue(hit.data, "clientVersion")
                const authType = dataValue(hit.data, "authType")
                const mstshash = dataValue(hit.data, "mstshash")
                const requestedSecurity = dataValue(hit.data, "requestedSecurity")
                const protocolName = dataValue(hit.data, "protocolName")
                const portDetail = [
                  protocolName && `${protocolName}`,
                  clientVersion && `client: ${clientVersion}`,
                  authType && `auth: ${authType}`,
                  mstshash && `user: ${mstshash}`,
                  requestedSecurity && `sec: ${requestedSecurity}`,
                  // VNC password attempt (the DES challenge-response, crackable offline)
                  hit.event_type === "auth" && hit.password && `pwd-resp: ${hit.password}`,
                ].filter(Boolean).join(" · ")
                return (
                  <TableRow key={hit.id}>
                    <TableCell className="font-mono text-xs">{hit.src_ip}:{hit.src_port ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{hit.dst_port}</TableCell>
                    <TableCell>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${BADGES[hit.event_type] ?? "bg-slate-400/20 text-slate-400"}`}>
                        {hit.event_type}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[24rem] whitespace-normal">
                      {(hit.event_type === "file.upload" || hit.event_type === "file.download") ? (
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs text-foreground" title={firstDataValue(hit.data, ["requestedPath", "fileName", "command"]) ?? undefined}>
                              {firstDataValue(hit.data, ["requestedPath", "fileName", "command"]) ?? "-"}
                            </p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {[
                                firstDataValue(hit.data, ["shareName", "share"]) && `share: ${firstDataValue(hit.data, ["shareName", "share"])}`,
                                (dataNumberValue(hit.data, "fileSize") ?? dataNumberValue(hit.data, "size")) !== null &&
                                  formatBytes((dataNumberValue(hit.data, "fileSize") ?? dataNumberValue(hit.data, "size")) as number),
                                dataValue(hit.data, "sha256") && `sha256: ${truncateMiddle(dataValue(hit.data, "sha256") as string, 24)}`,
                                dataValue(hit.data, "md5") && `md5: ${(dataValue(hit.data, "md5") as string).slice(0, 12)}…`,
                              ].filter(Boolean).join(" · ") || (hit.username ? `user: ${hit.username}` : "-")}
                            </p>
                          </div>
                        ) : isPortScan ? (
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-foreground">{portSummary?.title ?? "unknown service"}</p>
                            {portSummary && portSummary.lines.length > 0 ? (
                              <div className="space-y-1">
                                {portSummary.lines.slice(0, 3).map((line) => (
                                  <p key={line} className="truncate font-mono text-[11px] text-muted-foreground" title={line}>
                                    {line}
                                  </p>
                                ))}
                              </div>
                            ) : payloadHex ? (
                              <p className="truncate font-mono text-[11px] text-muted-foreground/60" title={payloadHex}>{payloadHex}</p>
                            ) : null}
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
                        ) : isSmb ? (
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-foreground">
                              {hit.username ?? "-"}
                              {dataValue(hit.data, "domain") && (
                                <span className="text-muted-foreground"> @ {dataValue(hit.data, "domain")}</span>
                              )}
                            </p>
                            {firstDataValue(hit.data, ["hostName", "nativeOS"]) && (
                              <p className="truncate font-mono text-[11px] text-muted-foreground">
                                {firstDataValue(hit.data, ["hostName", "nativeOS"])}
                              </p>
                            )}
                            {firstDataValue(hit.data, ["shareName", "share"]) && (
                              <p className="truncate font-mono text-[11px] text-amber-400/80">
                                \\{firstDataValue(hit.data, ["shareName", "share"])}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-foreground">{hit.username ?? "-"}</p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">{hit.password ?? "-"}</p>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(hit.timestamp)}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </TableCard>
    </PageShell>
  )
}
