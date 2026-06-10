import { readConfig } from "@/lib/server-config"
import { formatInTimezone } from "@/lib/timezone"
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table"
import { TableCard, TableCardFooter, EmptyRow } from "@/components/ui/table-card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ProtocolHit } from "@/lib/api"

// Per-protocol accent colors (tonal). Kept here since they're domain-specific
// and not part of the shared Badge variants.
const PROTOCOL_BADGE: Record<string, string> = {
  ftp: "bg-yellow-400/15 text-yellow-400",
  mysql: "bg-purple-400/15 text-purple-400",
  "port-scan": "bg-blue-400/15 text-blue-400",
  dionaea: "bg-red-400/15 text-red-400",
  smb: "bg-orange-400/15 text-orange-400",
  mssql: "bg-pink-400/15 text-pink-400",
  rpc: "bg-indigo-400/15 text-indigo-400",
  tftp: "bg-lime-400/15 text-lime-400",
  mqtt: "bg-teal-400/15 text-teal-400",
}

// connect → muted, auth → warning, command → success: maps to shared Badge variants.
const EVENT_VARIANT: Record<string, "muted" | "warning" | "success"> = {
  connect: "muted",
  auth: "warning",
  command: "success",
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
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Protocol</TableHead>
            <TableHead>Source IP</TableHead>
            <TableHead>Src Port</TableHead>
            <TableHead>Dst Port</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Timestamp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hits.length === 0 ? (
            <EmptyRow colSpan={7}>No events yet</EmptyRow>
          ) : (
            hits.map((hit) => (
              <TableRow key={hit.id}>
                <TableCell>
                  <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold uppercase", PROTOCOL_BADGE[hit.protocol] ?? "bg-slate-400/15 text-slate-400")}>
                    {hit.protocol}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">{hit.src_ip}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{hit.src_port ?? "—"}</TableCell>
                <TableCell className="text-xs">{hit.dst_port}</TableCell>
                <TableCell>
                  <Badge variant={EVENT_VARIANT[hit.event_type] ?? "muted"} className="text-[11px]">
                    {hit.event_type}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{hit.username ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(hit.timestamp)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <TableCardFooter>
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
        </TableCardFooter>
      )}
    </TableCard>
  )
}
