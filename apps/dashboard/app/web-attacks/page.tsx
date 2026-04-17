import { fetchWebHitsByIp, fetchWebHitsStats } from "@/lib/api"
import { PageShell } from "@/components/page-shell"
import { lookupIp } from "@/lib/geo"
import { AttackersTable } from "./attackers-table"
import { WebAttacksNav } from "@/components/web-attacks-nav"
import { ATTACK_COLORS, ATTACK_LABELS } from "@/lib/attack-types"

export default async function WebAttacksPage() {
  const [attackers, stats] = await Promise.all([
    fetchWebHitsByIp(),
    fetchWebHitsStats(),
  ])

  // Geo lookup en server — pasamos el resultado serializado al client component
  const geoMap: Record<string, { country: string; countryName: string } | null> = {}
  for (const a of attackers) {
    geoMap[a.srcIp] = lookupIp(a.srcIp)
  }

  return (
    <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Web Attacks</h1>
          <p className="text-sm text-muted-foreground">
            {stats.total} requests capturadas · {attackers.length} atacantes únicos · click en una fila para ver el detalle
          </p>
        </div>

        <WebAttacksNav active="attackers" />

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Total hits</p>
            <p className="mt-1 text-2xl font-semibold">{stats.total.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Atacantes únicos</p>
            <p className="mt-1 text-2xl font-semibold">{attackers.length}</p>
          </div>
          <div className="col-span-2 rounded-xl border border-border bg-card p-4">
            <p className="mb-2 text-sm text-muted-foreground">Tipos de ataque</p>
            <div className="flex flex-wrap gap-2">
              {stats.byAttackType.map((a) => (
                <span
                  key={a.attackType}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${ATTACK_COLORS[a.attackType] ?? ATTACK_COLORS.recon}`}
                >
                  {ATTACK_LABELS[a.attackType] ?? a.attackType}
                  <span className="font-mono opacity-70">{a.count}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Attackers table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP atacante</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Hits</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipos de ataque</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Paths principales</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Primer hit</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Último hit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AttackersTable attackers={attackers} geo={geoMap} />
            </tbody>
          </table>
        </div>
  </PageShell>
  )
}
