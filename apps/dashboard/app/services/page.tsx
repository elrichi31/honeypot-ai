import { fetchProtocolStats, fetchProtocolHits } from "@/lib/api"
import { PageShell } from "@/components/page-shell"
import { Network, Clock, Key } from "lucide-react"
import { ProtocolHitsTable } from "./protocol-hits-table"

const PROTOCOL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ftp: { bg: "bg-yellow-400/10", text: "text-yellow-400", border: "border-yellow-400/30" },
  mysql: { bg: "bg-purple-400/10", text: "text-purple-400", border: "border-purple-400/30" },
  "port-scan": { bg: "bg-blue-400/10", text: "text-blue-400", border: "border-blue-400/30" },
}

function defaultColor() {
  return { bg: "bg-slate-400/10", text: "text-slate-400", border: "border-slate-400/30" }
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; protocol?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page ?? "1")
  const protocol = params.protocol || undefined

  const [stats, hitsPage] = await Promise.all([
    fetchProtocolStats(),
    fetchProtocolHits({ page, limit: 50, protocol }),
  ])

  const totalHits = stats.reduce((sum, s) => sum + s.count, 0)

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Network Honeypots</h1>
        <p className="text-sm text-muted-foreground">
          {totalHits.toLocaleString()} events captured across {stats.length} protocol{stats.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Stats cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => {
          const c = PROTOCOL_COLORS[s.protocol] ?? defaultColor()
          return (
            <div key={s.protocol} className={`rounded-xl border ${c.border} bg-card p-4`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {s.protocol}
                  </p>
                  <p className={`text-3xl font-bold ${c.text}`}>{s.count.toLocaleString()}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">total events</p>
                </div>
                <div className={`rounded-lg p-2 ${c.bg}`}>
                  <Network className={`h-5 w-5 ${c.text}`} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Key className="h-3 w-3" />
                  {s.authAttempts.toLocaleString()} auth attempts
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(s.lastSeen)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Protocol filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <a
          href="/services"
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${!protocol ? "border-foreground/40 bg-foreground/10 text-foreground" : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}
        >
          All
        </a>
        {stats.map((s) => {
          const c = PROTOCOL_COLORS[s.protocol] ?? defaultColor()
          const active = protocol === s.protocol
          return (
            <a
              key={s.protocol}
              href={`/services?protocol=${s.protocol}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? `${c.border} ${c.bg} ${c.text}` : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}
            >
              {s.protocol}
            </a>
          )
        })}
      </div>

      {/* Hits table */}
      <ProtocolHitsTable
        hits={hitsPage.data}
        meta={hitsPage.meta}
        protocol={protocol}
      />
    </PageShell>
  )
}
