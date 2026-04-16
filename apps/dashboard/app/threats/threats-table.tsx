"use client"

import { useRouter } from "next/navigation"
import type { ThreatSummary, RiskLevel } from "@/lib/api"

const LEVEL_STYLES: Record<RiskLevel, { badge: string; dot: string; bar: string }> = {
  CRITICAL: { badge: "bg-red-500/15 text-red-400 border-red-500/40",       dot: "bg-red-500",    bar: "bg-red-500"    },
  HIGH:     { badge: "bg-orange-500/15 text-orange-400 border-orange-500/40", dot: "bg-orange-500", bar: "bg-orange-500" },
  MEDIUM:   { badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40", dot: "bg-yellow-500", bar: "bg-yellow-500" },
  LOW:      { badge: "bg-blue-500/15 text-blue-400 border-blue-500/40",      dot: "bg-blue-500",   bar: "bg-blue-500"   },
  INFO:     { badge: "bg-muted/40 text-muted-foreground border-border",       dot: "bg-muted-foreground", bar: "bg-muted-foreground" },
}

const CMD_LABELS: Record<string, string> = {
  malware_drop:     "Malware",
  persistence:      "Persist",
  lateral_movement: "Lateral",
  crypto_mining:    "Mining",
  data_exfil:       "Exfil",
  recon:            "Recon",
}

const CMD_COLORS: Record<string, string> = {
  malware_drop:     "bg-red-500/15 text-red-400",
  persistence:      "bg-orange-500/15 text-orange-400",
  lateral_movement: "bg-purple-500/15 text-purple-400",
  crypto_mining:    "bg-yellow-500/15 text-yellow-400",
  data_exfil:       "bg-pink-500/15 text-pink-400",
  recon:            "bg-muted/50 text-muted-foreground",
}

export function ThreatsTable({ threats }: { threats: ThreatSummary[] }) {
  const router = useRouter()

  if (threats.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">No hay datos de amenazas aún.</p>
        <p className="mt-1 text-xs text-muted-foreground/60">Aparecerán aquí cuando se detecten atacantes SSH o HTTP.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border p-4">
        <h2 className="font-semibold text-foreground">Ranking de amenazas</h2>
        <p className="text-xs text-muted-foreground">Ordenado por risk score · click para ver detalle</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
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
            {threats.map((t, i) => {
              const s = LEVEL_STYLES[t.level]
              const activeCmds = Object.entries(t.commandCategories).filter(([, v]) => v > 0)
              return (
                <tr
                  key={t.ip}
                  onClick={() => router.push(`/threats/${encodeURIComponent(t.ip)}`)}
                  className="cursor-pointer hover:bg-muted/10 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{i + 1}</td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${s.dot}`} />
                      <span className="font-mono text-sm font-medium text-foreground">{t.ip}</span>
                      {t.crossProtocol && (
                        <span className="inline-flex items-center rounded-full bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                          SSH+HTTP
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${s.badge}`}>
                      {t.level}
                    </span>
                  </td>

                  <td className="px-4 py-3 w-36">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted">
                        <div
                          className={`h-1.5 rounded-full ${s.bar}`}
                          style={{ width: `${t.score}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-xs font-semibold text-foreground">{t.score}</span>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {t.ssh && (
                        <span className="inline-flex items-center rounded bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400">
                          SSH {t.ssh.sessions}s
                        </span>
                      )}
                      {t.web && (
                        <span className="inline-flex items-center rounded bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                          HTTP {t.web.hits}h
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {activeCmds.length === 0 ? (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      ) : (
                        activeCmds.map(([cat, count]) => (
                          <span
                            key={cat}
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${CMD_COLORS[cat] ?? CMD_COLORS.recon}`}
                          >
                            {CMD_LABELS[cat] ?? cat} ×{count}
                          </span>
                        ))
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3 max-w-xs">
                    <ul className="space-y-0.5">
                      {t.topFactors.map((f, fi) => (
                        <li key={fi} className="text-xs text-muted-foreground truncate">{f}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
