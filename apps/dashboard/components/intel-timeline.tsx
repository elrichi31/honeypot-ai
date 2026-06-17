"use client"

import { useMemo, useState } from "react"
import { Terminal, ShieldAlert, Bug, Flag } from "lucide-react"
import { formatInTimezone } from "@/lib/timezone"
import { CMD_LABELS } from "@/lib/attack-types"
import type { ThreatDetail } from "@/lib/api/types"
import type { IpEnrichment } from "@/lib/ip-enrichment"

type Source = "honeypot" | "abuseipdb" | "virustotal"

interface TimelineItem {
  ts: number          // epoch ms, for sorting
  date: string        // ISO
  source: Source
  title: string
  detail?: string
  tag?: string
}

// AbuseIPDB report category IDs → human labels.
// https://www.abuseipdb.com/categories
const ABUSE_CATEGORIES: Record<number, string> = {
  3: "Fraud Orders", 4: "DDoS", 5: "FTP Brute-Force", 6: "Ping of Death",
  7: "Phishing", 8: "Fraud VoIP", 9: "Open Proxy", 10: "Web Spam",
  11: "Email Spam", 12: "Blog Spam", 13: "VPN IP", 14: "Port Scan",
  15: "Hacking", 16: "SQL Injection", 17: "Spoofing", 18: "Brute-Force",
  19: "Bad Web Bot", 20: "Exploited Host", 21: "Web App Attack", 22: "SSH",
  23: "IoT Targeted",
}

const SOURCE_META: Record<Source, { label: string; icon: typeof Terminal; color: string; dot: string }> = {
  honeypot:   { label: "Honeypot",   icon: Terminal,    color: "text-orange-400", dot: "bg-orange-500" },
  abuseipdb:  { label: "AbuseIPDB",  icon: ShieldAlert, color: "text-red-400",    dot: "bg-red-500" },
  virustotal: { label: "VirusTotal", icon: Bug,         color: "text-purple-400", dot: "bg-purple-500" },
}

function buildItems(threat: ThreatDetail, enrichment: IpEnrichment | null): TimelineItem[] {
  const items: TimelineItem[] = []

  // Honeypot — classified commands
  for (const c of threat.classifiedCommands) {
    const t = new Date(c.ts).getTime()
    if (Number.isNaN(t)) continue
    items.push({
      ts: t,
      date: c.ts,
      source: "honeypot",
      title: CMD_LABELS[c.category] ?? c.category,
      detail: c.command,
      tag: c.category,
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
      title: cats.length ? cats.join(", ") : "Reporte de abuso",
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
      title: `Análisis VT · ${s.malicious} maliciosos / ${s.suspicious} sospechosos`,
      detail: vt.tags.length ? `tags: ${vt.tags.join(", ")}` : undefined,
      tag: vt.reputation !== 0 ? `rep ${vt.reputation}` : undefined,
    })
  }

  return items.sort((a, b) => b.ts - a.ts)
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
        <p className="text-sm text-muted-foreground">Sin eventos de inteligencia para esta IP.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Source filter chips */}
      <div className="flex flex-wrap gap-2 border-b border-border p-3">
        {(Object.keys(SOURCE_META) as Source[]).map((s) => {
          const meta = SOURCE_META[s]
          const Icon = meta.icon
          const on = active.has(s)
          const has = present.has(s)
          return (
            <button
              key={s}
              type="button"
              disabled={!has}
              onClick={() => toggle(s)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                !has
                  ? "cursor-not-allowed border-border text-muted-foreground/40"
                  : on
                    ? `border-border ${meta.color}`
                    : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3 w-3" /> {meta.label}
              <span className="opacity-60">{all.filter((i) => i.source === s).length}</span>
            </button>
          )
        })}
      </div>

      {/* Timeline */}
      <div className="max-h-[560px] overflow-y-auto p-4">
        <ol className="relative border-l border-border pl-5">
          {items.map((item, i) => {
            const meta = SOURCE_META[item.source]
            return (
              <li key={i} className="mb-5 last:mb-0">
                <span className={`absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                  <span suppressHydrationWarning className="font-mono text-[11px] text-muted-foreground">
                    {formatInTimezone(item.date, timezone, {
                      year: "numeric", month: "2-digit", day: "2-digit",
                      hour: "2-digit", minute: "2-digit", hour12: false,
                    })}
                  </span>
                  {item.tag && (
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {item.tag}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-foreground">{item.title}</p>
                {item.detail && (
                  <code className="mt-1 block max-w-full truncate rounded bg-secondary px-2 py-1 font-mono text-[11px] text-muted-foreground" title={item.detail}>
                    {item.detail}
                  </code>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
