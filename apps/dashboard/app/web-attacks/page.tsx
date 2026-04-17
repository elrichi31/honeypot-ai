import { fetchWebHitsByIpPage, fetchWebHitsStats } from "@/lib/api"
import { PageShell } from "@/components/page-shell"
import { lookupIp } from "@/lib/geo"
import { AttackersTable } from "./attackers-table"
import { WebAttacksNav } from "@/components/web-attacks-nav"
import { ATTACK_COLORS, ATTACK_LABELS } from "@/lib/attack-types"
import { TablePagination } from "@/components/table-pagination"

const PAGE_SIZE_OPTIONS = new Set(["50", "100", "200"])

export default async function WebAttacksPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    q?: string
  }>
}) {
  const params = await searchParams
  const page = Number(params.page ?? "1")
  const pageSize = PAGE_SIZE_OPTIONS.has(params.pageSize ?? "") ? Number(params.pageSize) : 50
  const q = params.q?.trim() || undefined

  const [attackersPage, stats] = await Promise.all([
    fetchWebHitsByIpPage({ page, pageSize, q }),
    fetchWebHitsStats(),
  ])

  const geoMap: Record<string, { country: string; countryName: string } | null> = {}
  for (const attacker of attackersPage.items) {
    geoMap[attacker.srcIp] = lookupIp(attacker.srcIp)
  }

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Web Attacks</h1>
        <p className="text-sm text-muted-foreground">
          {stats.total} requests capturadas · {attackersPage.pagination.total} atacantes visibles
        </p>
      </div>

      <WebAttacksNav active="attackers" />

      <form className="mb-6 flex flex-wrap gap-2">
        <input type="hidden" name="pageSize" value={String(attackersPage.pagination.pageSize)} />
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar IP atacante..."
          className="h-10 min-w-72 rounded-md border border-border bg-background px-3 text-sm text-foreground"
        />
        <button
          type="submit"
          className="h-10 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Buscar
        </button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total hits</p>
          <p className="mt-1 text-2xl font-semibold">{stats.total.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Atacantes visibles</p>
          <p className="mt-1 text-2xl font-semibold">{attackersPage.pagination.total}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-sm text-muted-foreground">Tipos de ataque</p>
          <div className="flex flex-wrap gap-2">
            {stats.byAttackType.map((attack) => (
              <span
                key={attack.attackType}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${ATTACK_COLORS[attack.attackType] ?? ATTACK_COLORS.recon}`}
              >
                {ATTACK_LABELS[attack.attackType] ?? attack.attackType}
                <span className="font-mono opacity-70">{attack.count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

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
            <AttackersTable attackers={attackersPage.items} geo={geoMap} />
          </tbody>
        </table>
        <TablePagination pagination={attackersPage.pagination} />
      </div>
    </PageShell>
  )
}
