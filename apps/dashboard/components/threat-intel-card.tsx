"use client"

import { useState } from "react"
import {
  ShieldAlert,
  Radio,
  KeyRound,
  FileDigit,
  Copy,
  Check,
  ExternalLink,
  type LucideIcon,
} from "lucide-react"
import { Surface } from "@/components/ui/surface"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type {
  BotnetMatch,
  BotnetCategory,
  SessionIocs,
} from "@/lib/botnet-signatures"
import { useT } from "@/components/locale-provider"

const CATEGORY_STYLES: Record<BotnetCategory, { color: string; bg: string }> = {
  cryptominer: { color: "text-yellow-400", bg: "bg-yellow-400/15" },
  ddos:        { color: "text-orange-400", bg: "bg-orange-400/15" },
  worm:        { color: "text-red-400",    bg: "bg-red-400/15" },
  backdoor:    { color: "text-purple-400", bg: "bg-purple-400/15" },
  unknown:     { color: "text-muted-foreground", bg: "bg-secondary" },
}

function CopyButton({ value }: { value: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
      aria-label={t("threatIntel.card.copyLabel")}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function IocRow({
  icon: Icon,
  value,
  sub,
  href,
}: {
  icon: LucideIcon
  value: string
  sub?: string
  href?: string
}) {
  const t = useT()
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-mono text-foreground" title={value}>{value}</span>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={t("threatIntel.card.externalRef")}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      <CopyButton value={value} />
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  )
}

export function ThreatIntelCard({
  family,
  iocs,
}: {
  family: BotnetMatch | null
  iocs: SessionIocs
}) {
  const t = useT()
  const cat = family ? CATEGORY_STYLES[family.category] : null

  return (
    <Surface>
      <div className="flex items-center gap-2 border-b border-border p-4">
        <ShieldAlert className="h-4 w-4 text-destructive" />
        <h3 className="font-semibold text-foreground">{t("threatIntel.card.title")}</h3>
      </div>

      {/* Family attribution */}
      {family && cat && (
        <div className="border-b border-border p-4">
          <p className="mb-2 text-xs text-muted-foreground">{t("threatIntel.card.recognizedFamily")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={`cursor-help rounded-full px-3 py-1 text-sm font-medium ${cat.bg} ${cat.color}`}
                >
                  {t(family.nameKey)}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="mb-1 font-medium">{t(family.categoryKey)}</p>
                <p className="text-muted-foreground">{t(family.descriptionKey)}</p>
                <p className="mt-1.5 text-muted-foreground">
                  {t("threatIntel.card.patterns", { count: family.matchedPatterns.length, pct: Math.round(family.confidence * 100) })}
                </p>
              </TooltipContent>
            </Tooltip>
            <span className={`rounded-full px-2 py-0.5 text-xs ${cat.bg} ${cat.color}`}>{t(family.categoryKey)}</span>
            {family.aliases.slice(0, 3).map((a) => (
              <span key={a} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {a}
              </span>
            ))}
          </div>
          {family.references.length > 0 && (
            <a
              href={family.references[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> {t("threatIntel.card.reference")}
            </a>
          )}
        </div>
      )}

      {/* IoCs */}
      {iocs.c2.length > 0 && (
        <Section title={t("threatIntel.card.c2")} count={iocs.c2.length}>
          {iocs.c2.map((c) => (
            <IocRow
              key={c.value}
              icon={Radio}
              value={c.value}
              sub={c.type === "url" ? "URL" : t("threatIntel.card.directConn")}
              href={`/threats/${encodeURIComponent(c.host)}`}
            />
          ))}
        </Section>
      )}

      {iocs.sshKeys.length > 0 && (
        <Section title={t("threatIntel.card.sshKeys")} count={iocs.sshKeys.length}>
          {iocs.sshKeys.map((k) => (
            <IocRow
              key={k.fingerprint}
              icon={KeyRound}
              value={k.comment ? `${k.algorithm} · ${k.comment}` : k.algorithm}
              sub={k.fingerprint}
            />
          ))}
        </Section>
      )}

      {iocs.malwareHashes.length > 0 && (
        <Section title={t("threatIntel.card.malwareHashes")} count={iocs.malwareHashes.length}>
          {iocs.malwareHashes.map((h) => (
            <IocRow
              key={h}
              icon={FileDigit}
              value={h}
              href={`https://www.virustotal.com/gui/file/${h}`}
            />
          ))}
        </Section>
      )}
    </Surface>
  )
}
