import { notFound } from "next/navigation"
import Link from "next/link"
import { format, formatDistanceToNow } from "date-fns"
import { ArrowLeft, ShieldAlert, Terminal, Globe, Activity } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { fetchThreat } from "@/lib/api"
import type { RiskLevel } from "@/lib/api"

const LEVEL_STYLES: Record<RiskLevel, { badge: string; bg: string; bar: string }> = {
  CRITICAL: { badge: "bg-red-500/15 text-red-400 border-red-500/40",         bg: "bg-red-500/10",    bar: "bg-red-500"    },
  HIGH:     { badge: "bg-orange-500/15 text-orange-400 border-orange-500/40", bg: "bg-orange-500/10", bar: "bg-orange-500" },
  MEDIUM:   { badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40", bg: "bg-yellow-500/10", bar: "bg-yellow-500" },
  LOW:      { badge: "bg-blue-500/15 text-blue-400 border-blue-500/40",       bg: "bg-blue-500/10",   bar: "bg-blue-500"   },
  INFO:     { badge: "bg-muted/40 text-muted-foreground border-border",        bg: "bg-muted/20",      bar: "bg-muted-foreground" },
}

const CMD_COLORS: Record<string, string> = {
  malware_drop:     "bg-red-500/15 text-red-400 border-red-500/30",
  persistence:      "bg-orange-500/15 text-orange-400 border-orange-500/30",
  lateral_movement: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  crypto_mining:    "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  data_exfil:       "bg-pink-500/15 text-pink-400 border-pink-500/30",
  recon:            "bg-muted/50 text-muted-foreground border-border",
  other:            "bg-muted/30 text-muted-foreground border-border",
}

const CMD_LABELS: Record<string, string> = {
  malware_drop:     "Malware Drop",
  persistence:      "Persistence",
  lateral_movement: "Lateral Movement",
  crypto_mining:    "Crypto Mining",
  data_exfil:       "Data Exfil",
  recon:            "Recon",
  other:            "Other",
}

export default async function ThreatDetailPage({
  params,
}: {
  params: Promise<{ ip: string }>
}) {
  const { ip } = await params
  const srcIp = decodeURIComponent(ip)

  let threat
  try {
    threat = await fetchThreat(srcIp)
  } catch {
    notFound()
  }

  const s = LEVEL_STYLES[threat.risk.level]

  const activeCats = Object.entries(threat.risk.commandCategories).filter(([, cmds]) => cmds.length > 0)

  const breakdownItems = [
    { label: "SSH",           value: threat.risk.breakdown.ssh,        color: "bg-cyan-500" },
    { label: "Web",           value: threat.risk.breakdown.web,        color: "bg-blue-500" },
    { label: "Commands",      value: threat.risk.breakdown.commands,   color: "bg-orange-500" },
    { label: "Cross-protocol",value: threat.risk.breakdown.crossProto, color: "bg-purple-500" },
  ]

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/threats"
            className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a Threats
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
                    SSH + HTTP
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Risk score: <span className="font-mono font-semibold text-foreground">{threat.risk.score}/100</span></p>
            </div>
          </div>
        </div>

        {/* Top factors */}
        {threat.risk.topFactors.length > 0 && (
          <div className={`mb-6 rounded-xl border border-border ${s.bg} p-4`}>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Factores principales</p>
            <ul className="flex flex-wrap gap-2">
              {threat.risk.topFactors.map((f, i) => (
                <li key={i} className="flex items-center gap-1.5 text-sm text-foreground">
                  <span className="text-muted-foreground">·</span> {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-3">
          {/* Left column */}
          <div className="space-y-6 xl:col-span-1">

            {/* Risk breakdown */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Score breakdown</h3>
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
            </div>

            {/* SSH info */}
            {threat.ssh && (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-400" />
                  <h3 className="font-semibold text-foreground">SSH</h3>
                </div>
                <div className="divide-y divide-border text-sm">
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">Sesiones</span>
                    <span className="font-mono font-semibold text-foreground">{threat.ssh.sessions}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">Auth attempts</span>
                    <span className="font-mono font-semibold text-foreground">{threat.ssh.authAttempts}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">Login exitoso</span>
                    <span className={`font-semibold ${threat.ssh.loginSuccess ? "text-destructive" : "text-success"}`}>
                      {threat.ssh.loginSuccess ? "Sí" : "No"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Web info */}
            {threat.web && (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-4 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-400" />
                  <h3 className="font-semibold text-foreground">HTTP</h3>
                </div>
                <div className="divide-y divide-border text-sm">
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-muted-foreground">Total hits</span>
                    <span className="font-mono font-semibold text-foreground">{threat.web.hits.toLocaleString()}</span>
                  </div>
                  <div className="px-4 py-2.5">
                    <p className="mb-1.5 text-muted-foreground">Attack types</p>
                    <div className="flex flex-wrap gap-1">
                      {(threat.web.attackTypes ?? []).map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-400 border-blue-500/30"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Command categories */}
            {activeCats.length > 0 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-4 flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-orange-400" />
                  <h3 className="font-semibold text-foreground">Behavioral categories</h3>
                </div>
                <div className="divide-y divide-border">
                  {activeCats.map(([cat, cmds]) => (
                    <div key={cat} className="px-4 py-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${CMD_COLORS[cat] ?? CMD_COLORS.other}`}>
                          {CMD_LABELS[cat] ?? cat}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">{cmds.length} cmd{cmds.length !== 1 ? "s" : ""}</span>
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
              </div>
            )}
          </div>

          {/* Right column: classified commands timeline */}
          <div className="xl:col-span-2">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">SSH Commands timeline</h3>
                <p className="text-xs text-muted-foreground">{threat.classifiedCommands.length} comandos clasificados</p>
              </div>
              {threat.classifiedCommands.length === 0 ? (
                <div className="p-8 text-center">
                  <Terminal className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No se ejecutaron comandos SSH</p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[600px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-border bg-card">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Hora</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Categoría</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Comando</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {threat.classifiedCommands.map((c, i) => (
                        <tr key={i} className="hover:bg-muted/10 transition-colors">
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                            {format(new Date(c.ts), "HH:mm:ss")}
                            <span className="ml-1 text-[10px] text-muted-foreground/50">
                              {format(new Date(c.ts), "dd/MM")}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${CMD_COLORS[c.category] ?? CMD_COLORS.other}`}>
                              {CMD_LABELS[c.category] ?? c.category}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 max-w-sm">
                            <code className="font-mono text-xs text-foreground break-all">{c.command}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
