"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { ATTACK_COLORS, ATTACK_LABELS_LONG as ATTACK_LABELS } from "@/lib/attack-types"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import { cn } from "@/lib/utils"

export interface RequestGroup {
  method: string
  path: string
  attackType: string
  count: number
  lastSeen: string
  galahFailures: number
  canary: boolean
  sampleBody: string
  sampleHeaders: Record<string, string> | null
  sampleUserAgent: string
  sampleReferer?: string
  sampleHttpVersion?: string
}

/** Renders a known-noise header dictionary as aligned key: value lines. */
function HeaderBlock({ headers }: { headers: Record<string, string> | null }) {
  const entries = Object.entries(headers ?? {})
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="space-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="break-all">
          <span className="text-muted-foreground">{k}:</span> <span className="text-foreground">{v}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * One grouped request in the per-IP timeline. Collapsed it shows method, path,
 * type and a count; expanded it reveals the raw captured payload (body, headers,
 * user agent) of a representative hit from that group — the actual attack
 * content, which is what matters for analysis.
 */
export function RequestRow({ group }: { group: RequestGroup }) {
  const [open, setOpen] = useState(false)
  const tz = useTimezone()
  const hasDetail = Boolean(group.sampleBody || (group.sampleHeaders && Object.keys(group.sampleHeaders).length))

  return (
    <>
      <tr
        className={cn("transition-colors", hasDetail ? "cursor-pointer hover:bg-muted/10" : "hover:bg-muted/5")}
        onClick={() => hasDetail && setOpen((v) => !v)}
      >
        <td className="w-6 px-2 py-2 align-top">
          {hasDetail && (
            <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
          )}
        </td>
        <td className="whitespace-nowrap px-2 py-2 align-top">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{group.method}</span>
        </td>
        <td className="max-w-xs px-4 py-2 align-top">
          <p className="truncate font-mono text-xs text-foreground" title={group.path}>{group.path}</p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {group.canary && (
              <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/15 px-1.5 py-0 text-[10px] font-semibold text-red-400">
                🎯 Canary
              </span>
            )}
            {group.galahFailures > 0 && (
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[10px] font-medium text-amber-300">
                {group.galahFailures} failed
              </span>
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-4 py-2 align-top">
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium ${ATTACK_COLORS[group.attackType] ?? ATTACK_COLORS.recon}`}>
            {ATTACK_LABELS[group.attackType] ?? group.attackType}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-2 text-right align-top font-mono text-xs font-semibold text-foreground">
          ×{group.count}
        </td>
        <td className="whitespace-nowrap px-4 py-2 align-top font-mono text-xs text-muted-foreground">
          {formatInTimezone(group.lastSeen, tz, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
          <span className="ml-1 text-[10px] text-muted-foreground/50">{formatInTimezone(group.lastSeen, tz, { day: "2-digit", month: "2-digit" })}</span>
        </td>
      </tr>
      {open && hasDetail && (
        <tr className="bg-muted/5">
          <td colSpan={6} className="px-6 py-3">
            <div className="space-y-3 text-xs">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Captured payload · representative sample of {group.count} hit{group.count > 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-4">
                {group.sampleHttpVersion && (
                  <div>
                    <p className="mb-0.5 font-medium text-muted-foreground">HTTP version</p>
                    <span className="font-mono text-foreground">{group.sampleHttpVersion}</span>
                  </div>
                )}
                {group.sampleReferer && (
                  <div className="min-w-0 flex-1">
                    <p className="mb-0.5 font-medium text-muted-foreground">Referer</p>
                    <p className="truncate font-mono text-foreground" title={group.sampleReferer}>{group.sampleReferer}</p>
                  </div>
                )}
              </div>
              {group.sampleUserAgent && (
                <div>
                  <p className="mb-1 font-medium text-muted-foreground">User-Agent</p>
                  <pre className="overflow-x-auto rounded-md border border-border bg-background p-2 font-mono text-foreground">{group.sampleUserAgent}</pre>
                </div>
              )}
              {group.sampleBody && (
                <div>
                  <p className="mb-1 font-medium text-muted-foreground">Body</p>
                  <pre className="max-h-64 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-foreground whitespace-pre-wrap break-all">{group.sampleBody}</pre>
                </div>
              )}
              <div>
                <p className="mb-1 font-medium text-muted-foreground">Headers</p>
                <div className="max-h-48 overflow-auto rounded-md border border-border bg-background p-2 font-mono">
                  <HeaderBlock headers={group.sampleHeaders} />
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
