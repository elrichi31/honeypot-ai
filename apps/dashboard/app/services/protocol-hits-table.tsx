import { readConfig } from "@/lib/server-config"
import { formatInTimezone } from "@/lib/timezone"
import type { ProtocolHit } from "@/lib/api"

const PROTOCOL_BADGE: Record<string, string> = {
  ftp: "bg-yellow-400/20 text-yellow-400",
  mysql: "bg-purple-400/20 text-purple-400",
  "port-scan": "bg-blue-400/20 text-blue-400",
}

const EVENT_BADGE: Record<string, string> = {
  connect: "bg-slate-400/20 text-slate-400",
  auth: "bg-orange-400/20 text-orange-400",
  command: "bg-green-400/20 text-green-400",
}

interface Props {
  hits: ProtocolHit[]
  meta: { page: number; limit: number; total: number }
  protocol?: string
}

export function ProtocolHitsTable({ hits, meta, protocol }: Props) {
  const config = readConfig()
  const tz = config.timezone ?? process.env.DASHBOARD_TIMEZONE ?? "UTC"
  const formatDate = (v: string) =>
    formatInTimezone(v, tz, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })

  const totalPages = Math.ceil(meta.total / meta.limit)
  const buildHref = (p: number) =>
    `/services?page=${p}${protocol ? `&protocol=${protocol}` : ""}`

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Protocol</th>
              <th className="px-4 py-3 font-medium">Source IP</th>
              <th className="px-4 py-3 font-medium">Src Port</th>
              <th className="px-4 py-3 font-medium">Dst Port</th>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {hits.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No events yet
                </td>
              </tr>
            ) : (
              hits.map((hit) => (
                <tr key={hit.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${PROTOCOL_BADGE[hit.protocol] ?? "bg-slate-400/20 text-slate-400"}`}>
                      {hit.protocol}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{hit.src_ip}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{hit.src_port ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{hit.dst_port}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${EVENT_BADGE[hit.event_type] ?? "bg-slate-400/20 text-slate-400"}`}>
                      {hit.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{hit.username ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {formatDate(hit.timestamp)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>{meta.total.toLocaleString()} total events</span>
          <div className="flex items-center gap-2">
            {meta.page > 1 && (
              <a href={buildHref(meta.page - 1)} className="rounded border border-border px-2.5 py-1 hover:bg-muted/50">
                Prev
              </a>
            )}
            <span>Page {meta.page} of {totalPages}</span>
            {meta.page < totalPages && (
              <a href={buildHref(meta.page + 1)} className="rounded border border-border px-2.5 py-1 hover:bg-muted/50">
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
