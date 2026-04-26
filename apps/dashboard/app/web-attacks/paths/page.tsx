import { WebAttacksNav } from "@/components/web-attacks-nav"
import { PageShell } from "@/components/page-shell"
import { fetchWebPaths } from "@/lib/api"
import { ATTACK_COLORS, ATTACK_LABELS } from "@/lib/attack-types"

export default async function WebPathsPage() {
  const { paths } = await fetchWebPaths()

  const maxTotal = paths[0]?.total ?? 1

  // Agrupar paths por categoría dominante
  const scannerPaths  = paths.filter((p) => (p.byType["scanner"] ?? 0) / p.total > 0.5)
  const attackPaths   = paths.filter((p) => {
    const dangerous = (p.byType["sqli"] ?? 0) + (p.byType["lfi"] ?? 0) +
                      (p.byType["rfi"] ?? 0) + (p.byType["cmdi"] ?? 0) + (p.byType["xss"] ?? 0)
    return dangerous / p.total > 0.5
  })
  const reconPaths    = paths.filter(
    (p) => !scannerPaths.includes(p) && !attackPaths.includes(p)
  )

  return (
    <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Web Attacks · Paths</h1>
          <p className="text-sm text-muted-foreground">
            Análisis de las rutas más atacadas · top {paths.length} paths
          </p>
        </div>

        <WebAttacksNav active="paths" />

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Paths de scanner</p>
            <p className="mt-1 text-2xl font-semibold text-blue-400">{scannerPaths.length}</p>
            <p className="text-xs text-muted-foreground">wp-admin, phpmyadmin, .env…</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Paths de ataque</p>
            <p className="mt-1 text-2xl font-semibold text-red-400">{attackPaths.length}</p>
            <p className="text-xs text-muted-foreground">SQLi, LFI, XSS, CmdI…</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Recon / otros</p>
            <p className="mt-1 text-2xl font-semibold text-muted-foreground">{reconPaths.length}</p>
            <p className="text-xs text-muted-foreground">robots.txt, favicon, root…</p>
          </div>
        </div>

        {/* Full paths table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border p-4">
            <h3 className="font-semibold text-foreground">Todos los paths</h3>
            <p className="text-xs text-muted-foreground">Ordenados por frecuencia · barra = proporción del total</p>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Path</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-32">Hits</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Tipos</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-40">Frecuencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paths.map((p) => {
                  const pct = Math.round((p.total / maxTotal) * 100)
                  const dominantType = Object.entries(p.byType).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "recon"
                  const barColor = {
                    sqli:            "bg-red-500",
                    xss:             "bg-orange-500",
                    lfi:             "bg-yellow-500",
                    rfi:             "bg-yellow-600",
                    cmdi:            "bg-purple-500",
                    scanner:         "bg-blue-500",
                    info_disclosure: "bg-cyan-500",
                    recon:           "bg-muted-foreground/40",
                  }[dominantType] ?? "bg-muted-foreground/40"

                  return (
                    <tr key={p.path} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground max-w-xs">
                        <span className="truncate block" title={p.path}>{p.path}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-sm font-semibold text-foreground">
                        {p.total.toLocaleString('en-US')}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(p.byType)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 3)
                            .map(([type, count]) => (
                              <span
                                key={type}
                                className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${ATTACK_COLORS[type] ?? ATTACK_COLORS.recon}`}
                                title={`${count} hits`}
                              >
                                {ATTACK_LABELS[type] ?? type}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-muted">
                            <div
                              className={`h-1.5 rounded-full ${barColor}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
  </PageShell>
  )
}
