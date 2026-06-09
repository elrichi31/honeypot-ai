import { ShieldAlert } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { fetchThreatsPage, fetchClients, fetchSensors } from "@/lib/api"
import { ThreatsTable } from "./threats-table"
import { SectionError } from "@/components/section-error"
import { ClientSensorFilter } from "@/components/client-sensor-filter"

const PAGE_SIZE_OPTIONS = new Set(["20", "30", "50", "100"])

const VALID_THREAT_SORT_BY = new Set(["score", "sessions", "webHits", "protocols"])
const VALID_SORT_DIR = new Set(["asc", "desc"])
const VALID_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const
const VALID_COMMANDS = [
  "malware_drop", "persistence", "lateral_movement", "crypto_mining", "data_exfil", "recon", "other",
] as const

type RiskLevel = (typeof VALID_LEVELS)[number]

function parseCsv<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  if (!raw) return []
  const allowedSet = new Set<string>(allowed)
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean)
  return [...new Set(parts)].filter((p): p is T => allowedSet.has(p))
}

export default async function ThreatsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    q?: string
    sortBy?: string
    sortDir?: string
    levels?: string
    commands?: string
    crossProtocol?: string
    clientSlug?: string
    sensorId?: string
  }>
}) {
  const params = await searchParams
  const page = Number(params.page ?? "1")
  const pageSize = PAGE_SIZE_OPTIONS.has(params.pageSize ?? "") ? Number(params.pageSize) : 20
  const q = params.q?.trim() || undefined
  const sortBy = VALID_THREAT_SORT_BY.has(params.sortBy ?? "") ? (params.sortBy as "score" | "sessions" | "webHits" | "protocols") : "score"
  const sortDir = VALID_SORT_DIR.has(params.sortDir ?? "") ? (params.sortDir as "asc" | "desc") : "desc"
  const levels = parseCsv<RiskLevel>(params.levels, VALID_LEVELS)
  const commands = parseCsv(params.commands, VALID_COMMANDS)
  const crossProtocol = params.crossProtocol === "true" ? true : undefined
  const clientSlug = params.clientSlug?.trim() || undefined
  const sensorId = params.sensorId?.trim() || undefined

  let pageData: Awaited<ReturnType<typeof fetchThreatsPage>> | null = null
  let clients: Awaited<ReturnType<typeof fetchClients>> = []
  let sensors: Awaited<ReturnType<typeof fetchSensors>> = []
  try {
    ;[pageData, clients, sensors] = await Promise.all([
      fetchThreatsPage({ page, pageSize, q, sortBy, sortDir, levels, commands, crossProtocol, clientSlug, sensorId }),
      fetchClients().catch(() => []),
      fetchSensors().catch(() => []),
    ])
  } catch {
    pageData = null
  }

  const header = (
    <div className="mb-6">
      <div className="mb-1 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-destructive" />
        <h1 className="text-2xl font-semibold text-foreground">Threat Intelligence</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Cross-protocol correlation · risk scoring by IP
        {pageData ? ` · ${pageData.summary.total.toLocaleString('en-US')} attackers visible` : ""}
      </p>
    </div>
  )

  // A failed fetch must not look like "no threats" — show a clear, retryable
  // error instead of an empty table.
  if (!pageData) {
    return (
      <PageShell>
        {header}
        <SectionError
          title="Could not load threats"
          message="The cross-protocol correlation took too long or the backend did not respond. This is usually temporary — retry in a few seconds."
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      {header}

      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">Filter:</span>
          <ClientSensorFilter
            clients={clients.map((c) => ({ slug: c.slug, name: c.name }))}
            sensors={sensors.map((s) => ({ sensorId: s.sensorId, name: s.name, protocol: s.protocol, clientSlug: s.clientSlug, clientName: s.clientName }))}
            webOnly={false}
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total IPs</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">{pageData.summary.total}</p>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-xs text-red-400">CRITICAL</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-red-400">{pageData.summary.critical}</p>
        </div>
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
          <p className="text-xs text-orange-400">HIGH</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-orange-400">{pageData.summary.high}</p>
        </div>
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
          <p className="text-xs text-purple-400">Cross-protocol</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-purple-400">{pageData.summary.crossProtocol}</p>
        </div>
      </div>

      <ThreatsTable
        threats={pageData.items}
        pagination={pageData.pagination}
        sortBy={sortBy}
        sortDir={sortDir}
        searchQuery={q ?? ""}
        levels={levels}
        commands={commands}
        crossProtocol={crossProtocol === true}
      />
    </PageShell>
  )
}
