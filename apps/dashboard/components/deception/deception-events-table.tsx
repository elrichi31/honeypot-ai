"use client"

import { formatDistanceToNow } from "date-fns"
import type { DeceptionEvent } from "@/lib/api/deception"

export function DeceptionEventsTable({ events }: { events: DeceptionEvent[] }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Eventos crudos en nodos trampa</h2>
        <p className="text-[11px] text-muted-foreground">Cada interacción registrada por OpenCanary en la red interna.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="text-[10px] uppercase text-muted-foreground/60">
            <tr className="border-b border-border/40">
              <th className="px-4 py-2 font-medium">Nodo</th>
              <th className="px-4 py-2 font-medium">Servicio</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Credencial</th>
              <th className="px-4 py-2 font-medium text-right">Cuándo</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin eventos.</td></tr>
            ) : events.map(e => (
              <tr key={e.id} className="border-b border-border/20 hover:bg-white/[0.02]">
                <td className="px-4 py-2 font-mono text-foreground">{e.node_id ?? "?"}</td>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
