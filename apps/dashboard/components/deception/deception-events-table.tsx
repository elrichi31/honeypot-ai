"use client"

import { useState, Fragment } from "react"
import { formatDistanceToNow } from "date-fns"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { DeceptionEvent } from "@/lib/api/deception"
import { Surface } from "@/components/ui/surface"

// OpenCanary logdata keys we know how to label nicely. Anything else still shows
// up in the raw JSON toggle, so we never hide data — we just surface the common
// fields first.
const FIELD_LABELS: Record<string, string> = {
  USERNAME: "Username",
  PASSWORD: "Password",
  PATH: "Path",
  HOSTNAME: "Host",
  USERAGENT: "User-Agent",
  USER_AGENT: "User-Agent",
  SKIN: "Skin",
  LOCALVERSION: "Local version",
  REMOTEVERSION: "Client version",
  CLIENTVERSION: "Client version",
  COMMAND: "Command",
  COMMANDS: "Commands",
  SESSION: "Session",
  MYSQLVERSION: "MySQL version",
}

function prettyValue(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

function EventDetail({ event }: { event: DeceptionEvent }) {
  const [showRaw, setShowRaw] = useState(false)
  const logdata = event.logdata ?? {}
  // Flatten known fields first, in a sensible order, then any extras.
  const knownKeys = Object.keys(FIELD_LABELS).filter((k) => k in logdata)
  const extraKeys = Object.keys(logdata).filter(
    (k) => !(k in FIELD_LABELS) && k !== "msg",
  )

  const Field = ({ label, value }: { label: string; value: unknown }) => {
    const text = prettyValue(value)
    if (text === "—" || text === "") return null
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{label}</span>
        <span className="text-xs text-foreground break-words font-mono">{text}</span>
      </div>
    )
  }

  return (
    <div className="space-y-3 px-4 py-3 bg-background/40">
      {/* Connection facts */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Field label="Source IP (internal)" value={`${event.src_ip}${event.src_port ? `:${event.src_port}` : ""}`} />
        <Field label="Target node" value={event.node_name ?? event.dst_host ?? event.node_id} />
        <Field label="Service" value={`${event.protocol.toUpperCase()} :${event.dst_port}`} />
        <Field label="Type" value={event.event_type} />
      </div>

      {/* Decoded logdata fields */}
      {(knownKeys.length > 0 || extraKeys.length > 0) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 border-t border-border/40 pt-3">
          {knownKeys.map((k) => (
            <Field key={k} label={FIELD_LABELS[k]} value={(logdata as Record<string, unknown>)[k]} />
          ))}
          {extraKeys.map((k) => (
            <Field key={k} label={k} value={(logdata as Record<string, unknown>)[k]} />
          ))}
        </div>
      )}

      <button
        onClick={() => setShowRaw((v) => !v)}
        className="text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
      >
        {showRaw ? "Hide JSON" : "View raw JSON"}
      </button>
      {showRaw && (
        <pre className="rounded-lg bg-background border border-border px-3 py-2 text-[11px] text-foreground overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify({ logtype: event.logtype, logdata: event.logdata }, null, 2)}
        </pre>
      )}
    </div>
  )
}

export function DeceptionEventsTable({ events }: { events: DeceptionEvent[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <Surface>
      <div className="border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Raw events on trap nodes</h2>
        <p className="text-[11px] text-muted-foreground">Every interaction logged by OpenCanary on the internal network. Click a row to see the detail.</p>
      </div>
      <div className="overflow-x-clip">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 z-10 bg-card text-[10px] uppercase text-muted-foreground/60">
            <tr className="border-b border-border/40">
              <th className="px-4 py-2 font-medium w-6"></th>
              <th className="px-4 py-2 font-medium">Node</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Service</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Credential</th>
              <th className="px-4 py-2 font-medium text-right">When</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No events.</td></tr>
            ) : events.map(e => {
              const isExpanded = expandedId === e.id
              return (
                <Fragment key={e.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : e.id)}
                    className="border-b border-border/20 hover:bg-white/[0.02] cursor-pointer"
                  >
                    <td className="px-4 py-2 text-muted-foreground/50">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                    <td className="px-4 py-2 font-mono text-foreground">{e.node_name ?? e.node_id ?? "?"}</td>
                    <td className="px-4 py-2 font-mono text-muted-foreground">{e.src_ip}</td>
                    <td className="px-4 py-2 text-muted-foreground">{e.protocol.toUpperCase()} :{e.dst_port}</td>
                    <td className="px-4 py-2">
                      <span className={e.event_type === "auth" ? "text-red-400" : "text-muted-foreground"}>{e.event_type}</span>
                    </td>
                    <td className="px-4 py-2 font-mono text-muted-foreground">
                      {e.username ? `${e.username}${e.password ? ` / ${e.password}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground/70">
                      {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <EventDetail event={e} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Surface>
  )
}
