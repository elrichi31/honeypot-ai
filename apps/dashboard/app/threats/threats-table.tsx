"use client"

import { useRouter } from "next/navigation"
import { TablePagination } from "@/components/table-pagination"
import type { PaginationMeta, RiskLevel, ThreatSummary } from "@/lib/api"

const LEVEL_STYLES: Record<RiskLevel, { badge: string; dot: string; bar: string }> = {
  CRITICAL: { badge: "bg-red-500/15 text-red-400 border-red-500/40", dot: "bg-red-500", bar: "bg-red-500" },
  HIGH: { badge: "bg-orange-500/15 text-orange-400 border-orange-500/40", dot: "bg-orange-500", bar: "bg-orange-500" },
  MEDIUM: { badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40", dot: "bg-yellow-500", bar: "bg-yellow-500" },
  LOW: { badge: "bg-blue-500/15 text-blue-400 border-blue-500/40", dot: "bg-blue-500", bar: "bg-blue-500" },
  INFO: {
    badge: "bg-muted/40 text-muted-foreground border-border",
    dot: "bg-muted-foreground",
    bar: "bg-muted-foreground",
  },
}

const CMD_LABELS: Record<string, string> = {
  malware_drop: "Malware",
  persistence: "Persist",
  lateral_movement: "Lateral",
  crypto_mining: "Mining",
  data_exfil: "Exfil",
  recon: "Recon",
}

const CMD_COLORS: Record<string, string> = {
  malware_drop: "bg-red-500/15 text-red-400",
  persistence: "bg-orange-500/15 text-orange-400",
  lateral_movement: "bg-purple-500/15 text-purple-400",
  crypto_mining: "bg-yellow-500/15 text-yellow-400",
  data_exfil: "bg-pink-500/15 text-pink-400",
  recon: "bg-muted/50 text-muted-foreground",
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
            <p className="mt-1 text-xs text-muted-foreground/60">Apareceran aqui cuando se detecten atacantes SSH o HTTP.</p>
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
                            SSH+HTTP
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
                      <div className="flex gap-1">
                        {threat.ssh && (
                          <span className="inline-flex items-center rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400">
                            SSH {threat.ssh.sessions}s
                          </span>
                        )}
                        {threat.web && (
                          <span className="inline-flex items-center rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                            HTTP {threat.web.hits}h
                          </span>
                        )}
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
