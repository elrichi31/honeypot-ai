"use client"

import { useMemo, useState } from "react"
import { Terminal, ShieldAlert, Bug, Flag } from "lucide-react"
import { formatInTimezone } from "@/lib/timezone"
import { CMD_LABELS } from "@/lib/attack-types"
import type { ThreatDetail } from "@/lib/api/types"
import type { IpEnrichment } from "@/lib/ip-enrichment"

type Source = "honeypot" | "abuseipdb" | "virustotal"

interface TimelineItem {
  ts: number
  date: string
  source: Source
  title: string
  detail?: string
  tag?: string
  count?: number
  firstDate?: string
}

const ABUSE_CATEGORIES: Record<number, string> = {
  3: "Fraud Orders", 4: "DDoS", 5: "FTP Brute-Force", 6: "Ping of Death",
  7: "Phishing", 8: "Fraud VoIP", 9: "Open Proxy", 10: "Web Spam",
  11: "Email Spam", 12: "Blog Spam", 13: "VPN IP", 14: "Port Scan",
  15: "Hacking", 16: "SQL Injection", 17: "Spoofing", 18: "Brute-Force",
  19: "Bad Web Bot", 20: "Exploited Host", 21: "Web App Attack", 22: "SSH",
  23: "IoT Targeted",
}

const SOURCE_META: Record<Source, {
  label: string
  icon: typeof Terminal
  color: string
  dot: string
  ring: string
  bg: string
  text: string
}> = {
  honeypot:   {
    label: "Honeypot",
    icon: Terminal,
    color: "text-orange-400",
    dot: "bg-orange-500",
    ring: "ring-orange-500/30",
    bg: "bg-orange-500/10",
    text: "text-orange-300",
  },
  abuseipdb:  {
    label: "AbuseIPDB",
    icon: ShieldAlert,
    color: "text-red-400",
    dot: "bg-red-500",
    ring: "ring-red-500/30",
    bg: "bg-red-500/10",
    text: "text-red-300",
  },
  virustotal: {
    label: "VirusTotal",
    icon: Bug,
    color: "text-purple-400",
    dot: "bg-purple-500",
    ring: "ring-purple-500/30",
    bg: "bg-purple-500/10",
    text: "text-purple-300",
  },
}

function buildItems(threat: ThreatDetail, enrichment: IpEnrichment | null): TimelineItem[] {
  const items: TimelineItem[] = []

  // Honeypot — collapse identical commands, keep first/last timestamps
  const cmdGroups = new Map<string, { cat: string; cmd: string; count: number; first: number; last: number }>()
  for (const c of threat.classifiedCommands) {
    const t = new Date(c.ts).getTime()
    if (Number.isNaN(t)) continue
    const key = `${c.category} ${c.command}`
    const g = cmdGroups.get(key)
    if (g) {
      g.count++
      g.first = Math.min(g.first, t)
      g.last = Math.max(g.last, t)
    } else {
      cmdGroups.set(key, { cat: c.category, cmd: c.command, count: 1, first: t, last: t })
    }
  }
  for (const g of cmdGroups.values()) {
    items.push({
      ts: g.last,
      date: new Date(g.last).toISOString(),
      source: "honeypot",
      title: CMD_LABELS[g.cat] ?? g.cat,
      detail: g.cmd,
      tag: g.cat,
      count: g.count,
      firstDate: g.count > 1 ? new Date(g.first).toISOString() : undefined,
    })
  }

  // AbuseIPDB — external reports
  for (const r of enrichment?.abuseipdb?.reports ?? []) {
    const t = new Date(r.reportedAt).getTime()
    if (Number.isNaN(t)) continue
    const cats = r.categories.map((id) => ABUSE_CATEGORIES[id]).filter(Boolean)
    items.push({
      ts: t,
      date: r.reportedAt,
      source: "abuseipdb",
      title: cats.length ? cats.join(", ") : "Abuse report",
      detail: r.comment || undefined,
      tag: r.reporterCountryCode || undefined,
    })
  }

  // VirusTotal — analysis milestone
  const vt = enrichment?.virustotal
  if (vt?.last_analysis_date) {
    const s = vt.last_analysis_stats
    items.push({
      ts: vt.last_analysis_date * 1000,
      date: new Date(vt.last_analysis_date * 1000).toISOString(),
      source: "virustotal",
      title: `VT Analysis · ${s.malicious} malicious / ${s.suspicious} suspicious`,
      detail: vt.tags.length ? `tags: ${vt.tags.join(", ")}` : undefined,
      tag: vt.reputation !== 0 ? `rep ${vt.reputation}` : undefined,
    })
  }

  // Ascending chronological order (oldest first, newest last)
  return items.sort((a, b) => a.ts - b.ts)
}

export function IntelTimeline({
  threat,
  enrichment,
  timezone,
}: {
  threat: ThreatDetail
  enrichment: IpEnrichment | null
  timezone: string
}) {
  const all = useMemo(() => buildItems(threat, enrichment), [threat, enrichment])
  const [active, setActive] = useState<Set<Source>>(new Set(["honeypot", "abuseipdb", "virustotal"]))

  const present = useMemo(() => new Set(all.map((i) => i.source)), [all])
  const items = all.filter((i) => active.has(i.source))

  const toggle = (s: Source) => {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  if (all.length === 0) {
    return (
      <div className="p-8 text-center">
        <Flag className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No intelligence events for this IP.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Source filter chips */}
      <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
        {(Object.keys(SOURCE_META) as Source[]).map((s) => {
          const meta = SOURCE_META[s]
          const Icon = meta.icon
          const on = active.has(s)
          const has = present.has(s)
          const count = all.filter((i) => i.source === s).length
          return (
            <button
              key={s}
              type="button"
              disabled={!has}
              onClick={() => toggle(s)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                !has
                  ? "cursor-not-allowed border-border/40 text-muted-foreground/30"
                  : on
                    ? `border-transparent ${meta.bg} ${meta.text} ring-1 ${meta.ring}`
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              <Icon className="h-3 w-3" />
              {meta.label}
              {has && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${on ? meta.bg : "bg-secondary"}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
        {items.length > 0 && (
          <span className="ml-auto self-center text-[11px] text-muted-foreground/60">
            {items.length} event{items.length !== 1 ? "s" : ""} · oldest first
          </span>
        )}
      </div>

      {/* Timeline */}
      <div className="max-h-[560px] overflow-y-auto px-4 py-4">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No events match the selected filters.</p>
        ) : (
          <ol className="relative border-l border-border/50 pl-4">
            {items.map((item, i) => {
              const meta = SOURCE_META[item.source]
              const Icon = meta.icon
              return (
                <li key={i} className="relative mb-3 last:mb-0">
                  {/* Node dot */}
                  <div className={`absolute -left-[17px] top-[5px] flex h-5 w-5 items-center justify-center rounded-full border border-background ${meta.dot} ring-1 ${meta.ring}`}>
                    <Icon className="h-2.5 w-2.5 text-white" />
                  </div>

                  {/* Row: timestamp + badge */}
                  <div className="mb-0.5 flex items-center gap-2">
                    <span suppressHydrationWarning className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">
                      {formatInTimezone(item.date, timezone, {
                        month: "2-digit", day: "2-digit",
                        hour: "2-digit", minute: "2-digit", hour12: false,
                      })}
                    </span>
                    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.bg} ${meta.text}`}>
                      {meta.label}
                    </span>
                    {item.tag && (
                      <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70">
                        {item.tag}
                      </span>
                    )}
                    {item.count && item.count > 1 && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.text}`}>
                        ×{item.count}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <p className="text-sm font-medium leading-tight text-foreground">{item.title}</p>

                  {/* Date range for repeated events */}
                  {item.count && item.count > 1 && item.firstDate && (
                    <p suppressHydrationWarning className="mt-0.5 text-[10px] text-muted-foreground/50">
                      {item.count} times ·{" "}
                      {formatInTimezone(item.firstDate, timezone, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
                      {" – "}
                      {formatInTimezone(item.date, timezone, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
                    </p>
                  )}

                  {/* Detail / command */}
                  {item.detail && (
                    <code className="mt-1 block max-w-full truncate rounded bg-secondary/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground" title={item.detail}>
                      {item.detail}
                    </code>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
