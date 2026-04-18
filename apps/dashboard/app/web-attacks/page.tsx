import Link from "next/link"
import { Search } from "lucide-react"
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
          {stats.total.toLocaleString()} requests capturadas - {attackersPage.pagination.total.toLocaleString()} atacantes visibles
        </p>
      </div>

      <WebAttacksNav active="attackers" />

      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <form className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="pageSize" value={String(attackersPage.pagination.pageSize)} />
          <div className="relative min-w-[320px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar IP atacante..."
              className="h-10 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm text-foreground"
            />
          </div>
          <button
            type="submit"
            className="h-10 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Buscar
          </button>
          {q && (
            <Link
              href={`/web-attacks?pageSize=${attackersPage.pagination.pageSize}`}
              className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Limpiar
            </Link>
          )}
          <span className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
            {attackersPage.items.length} filas en esta pagina
          </span>
        </form>
      </div>

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

      <div className="flex min-h-[620px] max-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold text-foreground">Attackers</h2>
          <p className="text-xs text-muted-foreground">IPs HTTP ordenadas por actividad y volumen de hits</p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-[1080px] w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP atacante</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Hits</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipos de ataque</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Paths principales</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Primer hit</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ultimo hit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AttackersTable attackers={attackersPage.items} geo={geoMap} />
            </tbody>
          </table>
        </div>

        <TablePagination pagination={attackersPage.pagination} />
      </div>
    </PageShell>
  )
}
