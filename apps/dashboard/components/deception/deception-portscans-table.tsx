"use client"

import { formatDistanceToNow } from "date-fns"
import { Radar } from "lucide-react"
import type { DeceptionPortscan } from "@/lib/api/deception"
import { Surface } from "@/components/ui/surface"

export function DeceptionPortscansTable({ portscans }: { portscans: DeceptionPortscan[] }) {
  return (
    <Surface>
      <div className="border-b border-border/60 px-4 py-3 flex items-center gap-2">
        <Radar className="h-4 w-4 text-yellow-400" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Port scans on trap nodes</h2>
          <p className="text-[11px] text-muted-foreground">Reconnaissance detected by OpenCanary on the internal deception network.</p>
        </div>
      </div>
      <div className="overflow-x-clip">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 z-10 bg-card text-[10px] uppercase text-muted-foreground/60">
            <tr className="border-b border-border/40">
              <th className="px-4 py-2 font-medium">Source IP</th>
              <th className="px-4 py-2 font-medium">Node</th>
              <th className="px-4 py-2 font-medium">Ports scanned</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium text-right">When</th>
            </tr>
          </thead>
          <tbody>
            {portscans.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No port scans detected yet.
                </td>
              </tr>
            ) : portscans.map((ps) => (
              <tr key={ps.id} className="border-b border-border/20 hover:bg-white/[0.02]">
                <td className="px-4 py-2 font-mono text-foreground">{ps.src_ip}</td>
                <td className="px-4 py-2 font-mono text-muted-foreground">
                  {ps.node_id ?? "—"}
                </td>
                <td className="px-4 py-2">
                  {ps.dst_ports.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="font-mono text-yellow-400">
                      {ps.dst_ports.slice(0, 12).join(", ")}
                      {ps.dst_ports.length > 12 && (
                        <span className="text-muted-foreground"> +{ps.dst_ports.length - 12} more</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground uppercase text-[10px] tracking-wide">
                  {ps.scan_type}
                </td>
                <td className="px-4 py-2 text-right text-muted-foreground/70">
                  {formatDistanceToNow(new Date(ps.timestamp), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  )
}
