import { notFound } from "next/navigation"
import { PageShell } from "@/components/page-shell"
import Link from "next/link"
import { ArrowLeft, ShieldAlert, Terminal, Globe, Activity, Radar } from "lucide-react"
import { fetchThreat } from "@/lib/api"
import { readConfig } from "@/lib/server-config"
import { formatInTimezone } from "@/lib/timezone"
import { LEVEL_STYLES, CMD_COLORS, CMD_LABELS } from "@/lib/attack-types"
import { AiThreatSummary } from "@/components/ai-threat-summary"
import { IpEnrichment } from "@/components/ip-enrichment"
import { ThreatGraphView } from "@/components/threat-graph-view"
import { IntelTimeline } from "@/components/intel-timeline"
import { buildThreatGraph } from "@/lib/threat-graph"
import { db } from "@/lib/db"
import type { IpEnrichment as IpEnrichmentData } from "@/lib/ip-enrichment"
import { Surface } from "@/components/ui/surface"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { getServerT } from "@/lib/i18n/server"
import fs from "fs"
import path from "path"
import type { ThreatAnalysis } from "@/app/api/ai/threat-analysis/route"

// Reads the cached IP enrichment straight from the DB (same pattern as the
// session detail page) so the graph/timeline never spend external API quota.
async function readEnrichmentCache(ip: string): Promise<IpEnrichmentData | null> {
  try {
    const { rows } = await db.query(
      `SELECT abuseipdb_data, ipinfo_data, spectra_analyze_data, virustotal_data, cached_at FROM ip_enrichment_cache WHERE ip = $1`,
      [ip]
    )
    const row = rows[0]
    if (!row || (!row.abuseipdb_data && !row.ipinfo_data && !row.spectra_analyze_data && !row.virustotal_data)) return null
    return {
      ip,
      abuseipdb: row.abuseipdb_data,
      ipinfo: row.ipinfo_data,
      spectraAnalyze: row.spectra_analyze_data,
      virustotal: row.virustotal_data ?? null,
      cachedAt: row.cached_at.toISOString(),
    }
  } catch { return null }
}

function readThreatCache(ip: string): ThreatAnalysis | null {
  try {
    const cachePath = path.join(process.cwd(), "data", "ai-threat-cache.json")
    if (!fs.existsSync(cachePath)) return null
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"))
    return cache[ip] ?? null
  } catch {
    return null
  }
}

export default async function ThreatDetailPage({
  params,
}: {
  params: Promise<{ ip: string }>
}) {
  const t = await getServerT()
  const { ip } = await params
  const srcIp = decodeURIComponent(ip)
  const tz = readConfig().timezone ?? process.env.DASHBOARD_TIMEZONE ?? "UTC"

  let threat
  try {
    threat = await fetchThreat(srcIp)
  } catch {
    notFound()
  }

  const cachedAnalysis = readThreatCache(srcIp)
  const enrichmentCache = await readEnrichmentCache(srcIp)
  const graph = buildThreatGraph(threat, enrichmentCache)

  const s = LEVEL_STYLES[threat.risk.level]

  const activeCats = Object.entries(threat.risk.commandCategories).filter(([, cmds]) => cmds.length > 0)

  const breakdownItems = [
    { label: t("threats.detail.breakdown.ssh"),           value: threat.risk.breakdown.ssh,        color: "bg-cyan-500" },
    { label: t("threats.detail.breakdown.web"),           value: threat.risk.breakdown.web,        color: "bg-blue-500" },
    { label: t("threats.detail.breakdown.services"),      value: threat.risk.breakdown.protocols,  color: "bg-emerald-500" },
    { label: t("threats.detail.breakdown.commands"),      value: threat.risk.breakdown.commands,   color: "bg-orange-500" },
    { label: t("threats.detail.breakdown.crossProtocol"),value: threat.risk.breakdown.crossProto, color: "bg-purple-500" },
  ]

  return (
    <PageShell>
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/threats"
            className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t("threats.detail.back")}
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-mono text-2xl font-semibold text-foreground">{srcIp}</h1>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-semibold ${s.badge}`}>
                  {threat.risk.level}
                </span>
                {threat.crossProtocol && (
                  <span className="inline-flex items-center rounded-full bg-purple-500/15 border border-purple-500/30 px-2.5 py-1 text-xs font-medium text-purple-400">
                    {t("threats.detail.multiService", { n: threat.protocolsSeen.length })}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t("threats.detail.riskScore")} <span className="font-mono font-semibold text-foreground">{threat.risk.score}/100</span></p>
            </div>
          </div>
        </div>

        {/* Top factors */}
        {threat.risk.topFactors.length > 0 && (
          <Surface padded className={`mb-6 ${s.bg}`}>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("threats.detail.topFactors")}</p>
            <ul className="flex flex-wrap gap-2">
              {threat.risk.topFactors.map((f, i) => (
                <li key={i} className="flex items-center gap-1.5 text-sm text-foreground">
                  <span className="text-muted-foreground">·</span> {f}
                </li>
              ))}
            </ul>
          </Surface>
        )}

        {/* IP Enrichment — lazy, cached */}
        <div className="mb-4">
          <IpEnrichment ip={srcIp} />
        </div>

        {/* AI Threat Intelligence — auto-triggers if score >= 60 */}
        <div className="mb-6">
          <AiThreatSummary
            ip={srcIp}
            threat={threat}
            initialAnalysis={cachedAnalysis}
            autoTrigger={threat.risk.score >= 60}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          {/* Left column */}
          <div className="space-y-6 xl:col-span-1">

            {/* Risk breakdown */}
            <Surface>
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">{t("threats.detail.scoreBreakdown")}</h3>
              </div>
              <div className="divide-y divide-border">
                {breakdownItems.map(({ label, value, color }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-28 shrink-0 text-sm text-muted-foreground">{label}</div>
                    <div className="flex flex-1 items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted">
                        {value > 0 && (
                          <div
                            className={`h-1.5 rounded-full ${color}`}
                            style={{ width: `${Math.min(100, (value / 40) * 100)}%` }}
                          />
                        )}
                      </div>
                      <span className="w-6 text-right font-mono text-xs font-semibold text-foreground">{value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Surface>

            {/* SSH info */}
            {threat.ssh && (
              <Surface>
                <div className="border-b border-border p-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-400" />
                  <h3 className="font-semibold text-foreground">SSH</h3>
                </div>
                <div className="divide-y divide-border text-sm">
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">{t("threats.detail.ssh.sessions")}</span>
                    <span className="font-mono font-semibold text-foreground">{threat.ssh.sessions}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">{t("threats.detail.ssh.authAttempts")}</span>
                    <span className="font-mono font-semibold text-foreground">{threat.ssh.authAttempts}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">{t("threats.detail.ssh.successfulLogin")}</span>
                    <span className={`font-semibold ${threat.ssh.loginSuccess ? "text-destructive" : "text-success"}`}>
                      {threat.ssh.loginSuccess ? t("threats.detail.yes") : t("threats.detail.no")}
                    </span>
                  </div>
                </div>
              </Surface>
            )}

            {/* Port scans (deception honeynodes) */}
            {threat.portScans && threat.portScans.events > 0 && (
              <Surface>
                <div className="border-b border-border p-4 flex items-center gap-2">
                  <Radar className="h-4 w-4 text-violet-400" />
                  <h3 className="font-semibold text-foreground">Port Scans</h3>
                </div>
                <div className="divide-y divide-border text-sm">
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">Scan events</span>
                    <span className="font-mono font-semibold text-foreground">{threat.portScans.events.toLocaleString('en-US')}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">Unique ports probed</span>
                    <span className="font-mono font-semibold text-foreground">{threat.portScans.uniquePorts}</span>
                  </div>
                  {threat.portScans.ports.length > 0 && (
                    <div className="px-4 py-2.5">
                      <p className="mb-1.5 text-muted-foreground">Ports</p>
                      <div className="flex flex-wrap gap-1">
                        {threat.portScans.ports.slice(0, 30).map((port) => (
                          <span key={port} className="inline-flex items-center rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-400">
                            {port}
                          </span>
                        ))}
                        {threat.portScans.ports.length > 30 && (
                          <span className="text-xs text-muted-foreground">+{threat.portScans.ports.length - 30} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Surface>
            )}

            {threat.protocols && (
              <Surface>
                <div className="border-b border-border p-4 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-emerald-400" />
                  <h3 className="font-semibold text-foreground">{t("threats.detail.serviceHoneypots")}</h3>
                </div>
                <div className="space-y-4 p-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-secondary/30 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("threats.detail.protocolsSeen")}</p>
                      <p className="mt-1 font-mono text-lg font-semibold text-foreground">{threat.protocols.names.length}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/30 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("threats.detail.uniquePorts")}</p>
                      <p className="mt-1 font-mono text-lg font-semibold text-foreground">{threat.protocols.uniquePorts}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/30 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("threats.detail.serviceAuth")}</p>
                      <p className="mt-1 font-mono text-lg font-semibold text-foreground">{threat.protocols.authAttempts}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/30 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("threats.detail.serviceCommands")}</p>
                      <p className="mt-1 font-mono text-lg font-semibold text-foreground">{threat.protocols.commandEvents}</p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-muted-foreground">{t("threats.detail.byService")}</p>
                    <div className="space-y-2">
                      {Object.entries(threat.protocols.byService).map(([protocol, stats]) => (
                        <div key={protocol} className="rounded-lg border border-border bg-secondary/20 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-xs font-semibold uppercase tracking-wide text-foreground">{protocol}</span>
                            <span className="text-xs text-muted-foreground">
                              {stats.ports.length > 0 ? t("threats.detail.ports", { ports: stats.ports.join(", ") }) : t("threats.detail.noPortData")}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>{t("threats.detail.events", { n: stats.hits })}</span>
                            <span>{t("threats.detail.auth", { n: stats.authAttempts })}</span>
                            <span>{t("threats.detail.commands", { n: stats.commandEvents })}</span>
                            <span>{t("threats.detail.connect", { n: stats.connectEvents })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {(threat.protocols.usernames.length > 0 || threat.protocols.passwords.length > 0) && (
                    <div className="space-y-2">
                      <p className="text-muted-foreground">{t("threats.detail.credentialSignal")}</p>
                      <div className="flex flex-wrap gap-2">
                        {threat.protocols.credentialReuse && (
                          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                            {t("threats.detail.reusedAcrossServices")}
                          </span>
                        )}
                        {threat.protocols.usernames.slice(0, 6).map((username) => (
                          <span key={`u-${username}`} className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-foreground">
                            {t("threats.detail.user", { name: username })}
                          </span>
                        ))}
                        {threat.protocols.passwords.slice(0, 4).map((password) => (
                          <span key={`p-${password}`} className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-foreground">
                            {t("threats.detail.pass", { value: password })}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Surface>
            )}

            {/* Web info */}
            {threat.web && (
              <Surface>
                <div className="border-b border-border p-4 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-400" />
                  <h3 className="font-semibold text-foreground">HTTP</h3>
                </div>
                <div className="divide-y divide-border text-sm">
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">{t("threats.detail.totalHits")}</span>
                    <span className="font-mono font-semibold text-foreground">{threat.web.hits.toLocaleString('en-US')}</span>
                  </div>
                  <div className="px-4 py-2.5">
                    <p className="mb-1.5 text-muted-foreground">{t("threats.detail.attackTypes")}</p>
                    <div className="flex flex-wrap gap-1">
                      {(threat.web.attackTypes ?? []).map((attackType) => (
                        <span
                          key={attackType}
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-400 border-blue-500/30"
                        >
                          {attackType}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Surface>
            )}

            {/* Command categories */}
            {activeCats.length > 0 && (
              <Surface>
                <div className="border-b border-border p-4 flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-orange-400" />
                  <h3 className="font-semibold text-foreground">{t("threats.detail.behavioralCategories")}</h3>
                </div>
                <div className="divide-y divide-border">
                  {activeCats.map(([cat, cmds]) => (
                    <div key={cat} className="px-4 py-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${CMD_COLORS[cat] ?? CMD_COLORS.other}`}>
                          {CMD_LABELS[cat] ?? cat}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">{cmds.length !== 1 ? t("threats.detail.cmds", { n: cmds.length }) : t("threats.detail.cmd", { n: cmds.length })}</span>
                      </div>
                      <div className="max-h-28 overflow-y-auto space-y-0.5">
                        {cmds.map((cmd, ci) => (
                          <code key={ci} className="flex rounded bg-secondary px-2 py-1 font-mono text-[11px] text-foreground">
                            <span className="mr-1.5 select-none text-muted-foreground">$</span>
                            {cmd}
                          </code>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Surface>
            )}
          </div>

          {/* Right column: classified commands timeline */}
          <div className="xl:col-span-2">
            <Surface className="overflow-hidden">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">{t("threats.detail.commandsTimeline")}</h3>
                <p className="text-xs text-muted-foreground">{t("threats.detail.classifiedCommands", { n: threat.classifiedCommands.length })}</p>
              </div>
              {threat.classifiedCommands.length === 0 ? (
                <div className="p-8 text-center">
                  <Terminal className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">{t("threats.detail.noCommands")}</p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[600px]">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead>{t("threats.detail.col.time")}</TableHead>
                        <TableHead>{t("threats.detail.col.category")}</TableHead>
                        <TableHead>{t("threats.detail.col.command")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {threat.classifiedCommands.map((c, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {formatInTimezone(c.ts, tz, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                            <span className="ml-1 text-[10px] text-muted-foreground/50">
                              {formatInTimezone(c.ts, tz, { day: "2-digit", month: "2-digit" })}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${CMD_COLORS[c.category] ?? CMD_COLORS.other}`}>
                              {CMD_LABELS[c.category] ?? c.category}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-sm">
                            <code className="font-mono text-xs text-foreground break-all">{c.command}</code>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Surface>
          </div>
        </div>

        {/* Attack graph — interactive node/edge view of everything this IP did */}
        <Surface className="mt-6 overflow-hidden">
          <div className="border-b border-border p-4">
            <h3 className="font-semibold text-foreground">{t("threats.detail.graph.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("threats.detail.graph.subtitle")}</p>
          </div>
          <ThreatGraphView graph={graph} />
        </Surface>

        {/* Intelligence timeline — honeypot activity + AbuseIPDB / VirusTotal */}
        <Surface className="mt-6 overflow-hidden">
          <div className="border-b border-border p-4">
            <h3 className="font-semibold text-foreground">{t("threats.detail.timeline.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("threats.detail.timeline.subtitle")}</p>
          </div>
          <IntelTimeline threat={threat} enrichment={enrichmentCache} timezone={tz} />
        </Surface>
  </PageShell>
  )
}
