"use client"

import { useRouter } from "next/navigation"
import { TablePagination } from "@/components/table-pagination"
import type { PaginationMeta, ThreatSummary } from "@/lib/api"
import { LEVEL_STYLES, CMD_COLORS, CMD_LABELS_SHORT as CMD_LABELS } from "@/lib/attack-types"

const PROTOCOL_LABELS: Record<string, string> = {
  ssh: "SSH",
  http: "HTTP",
  ftp: "FTP",
  mysql: "MYSQL",
  "port-scan": "PORT-SCAN",
}

const PROTOCOL_STYLES: Record<string, string> = {
  ssh: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400",
  http: "border-blue-500/20 bg-blue-500/10 text-blue-400",
  ftp: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  mysql: "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-400",
  "port-scan": "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
}

export function ThreatsTable({
  threats,
  pagination,
}: {
  threats: ThreatSummary[]
  pagination?: PaginationMeta
}) {
  const router = useRouter()

  return (
    <div className="flex min-h-[620px] max-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="font-semibold text-foreground">Ranking de amenazas</h2>
        <p className="text-xs text-muted-foreground">Ordenado por risk score - click para ver detalle</p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {threats.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground">No hay datos de amenazas aun.</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Apareceran aqui cuando se detecten atacantes en SSH, HTTP o servicios correlacionados.</p>
          </div>
        ) : (
          <table className="min-w-[1180px] w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">#</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">IP</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Nivel</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Score</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Protocolos</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Comandos detectados</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Top factores</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {threats.map((threat, index) => {
                const style = LEVEL_STYLES[threat.level]
                const activeCommands = Object.entries(threat.commandCategories).filter(([, value]) => value > 0)
                const protocolBadges = threat.protocolsSeen.map((protocol) => {
                  const label = PROTOCOL_LABELS[protocol] ?? protocol.toUpperCase()
                  const badgeStyle = PROTOCOL_STYLES[protocol] ?? "border-border bg-muted/10 text-muted-foreground"
                  const protocolStats = threat.protocols?.byService?.[protocol]
                  const value =
                    protocol === "ssh" ? `${threat.ssh?.sessions ?? 0}s`
                    : protocol === "http" ? `${threat.web?.hits ?? 0}h`
                    : `${protocolStats?.hits ?? 0}e`

                  return { protocol, label, badgeStyle, value }
                })

                return (
                  <tr
                    key={threat.ip}
                    onClick={() => router.push(`/threats/${encodeURIComponent(threat.ip)}`)}
                    className="cursor-pointer transition-colors hover:bg-muted/10"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{index + 1}</td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                        <span className="font-mono text-sm font-medium text-foreground">{threat.ip}</span>
                        {threat.crossProtocol && (
                          <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                            MULTI {threat.protocolsSeen.length}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${style.badge}`}>
                        {threat.level}
                      </span>
                    </td>

                    <td className="w-36 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted">
                          <div className={`h-1.5 rounded-full ${style.bar}`} style={{ width: `${threat.score}%` }} />
                        </div>
                        <span className="w-8 text-right font-mono text-xs font-semibold text-foreground">{threat.score}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {protocolBadges.map(({ protocol, label, badgeStyle, value }) => (
                          <span
                            key={protocol}
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${badgeStyle}`}
                          >
                            {label} {value}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {activeCommands.length === 0 ? (
                          <span className="text-xs text-muted-foreground/50">-</span>
                        ) : (
                          activeCommands.map(([category, count]) => (
                            <span
                              key={category}
                              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${CMD_COLORS[category] ?? CMD_COLORS.recon}`}
                            >
                              {CMD_LABELS[category] ?? category} x{count}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    <td className="max-w-xs px-4 py-3">
                      <ul className="space-y-0.5">
                        {threat.topFactors.map((factor, factorIndex) => (
                          <li key={factorIndex} className="truncate text-xs text-muted-foreground">
                            {factor}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {pagination && <TablePagination pagination={pagination} />}
    </div>
  )
}
