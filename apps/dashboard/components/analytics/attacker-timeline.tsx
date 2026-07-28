"use client"

import { useEffect, useState, useCallback } from "react"
import { Terminal, Globe, Radar, ShieldAlert } from "lucide-react"
import { Surface } from "@/components/ui/surface"
import { EmptyState, ErrorState } from "@/components/ui/data-states"
import { useT } from "@/components/locale-provider"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import type { TranslationKey } from "@/lib/i18n/dictionaries"
import { chTimestampToIso, FULL_TIMESTAMP_OPTS } from "./shared"

type Source = "cowrie" | "web" | "protocol" | "suricata"
type TimelineItem = { eventId: string; timestamp: string; sensorId: string; source: Source; kind: string; summary: string }
type TimelineResponse = { items: TimelineItem[]; hasMore: boolean; nextBefore: string | null }

const SOURCE_ICON: Record<Source, typeof Terminal> = {
  cowrie: Terminal,
  web: Globe,
  protocol: Radar,
  suricata: ShieldAlert,
}
const SOURCE_COLOR: Record<Source, string> = {
  cowrie: "text-cyan-400",
  web: "text-blue-400",
  protocol: "text-emerald-400",
  suricata: "text-red-400",
}
const SOURCE_LABEL_KEY: Record<Source, TranslationKey> = {
  cowrie: "analytics.attackerTimeline.source.cowrie",
  web: "analytics.attackerTimeline.source.web",
  protocol: "analytics.attackerTimeline.source.protocol",
  suricata: "analytics.attackerTimeline.source.suricata",
}

export function AttackerTimeline({ ip }: { ip: string }) {
  const t = useT()
  const tz = useTimezone()
  const [items, setItems] = useState<TimelineItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [status, setStatus] = useState<"loading" | "unavailable" | "error" | "ok">("loading")
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback((before: string | undefined, signal?: AbortSignal) => {
    const url = new URL(`/api/analytics/attacker/${encodeURIComponent(ip)}/timeline`, window.location.origin)
    url.searchParams.set("limit", "200")
    if (before) url.searchParams.set("before", before)
    return fetch(url.toString(), { signal }).then(async (res) => {
      if (res.status === 503) { setStatus("unavailable"); return null }
      if (!res.ok) { setStatus("error"); return null }
      setStatus("ok")
      return (await res.json()) as TimelineResponse
    })
  }, [ip])

  useEffect(() => {
    const controller = new AbortController()
    setStatus("loading")
    load(undefined, controller.signal).then((body) => {
      if (!body) return
      setItems(body.items)
      setHasMore(body.hasMore)
      setNextBefore(body.nextBefore)
    }).catch((err) => { if (err?.name !== "AbortError") setStatus("error") })
    return () => controller.abort()
  }, [load])

  async function loadMore() {
    if (!nextBefore) return
    setLoadingMore(true)
    try {
      const body = await load(nextBefore)
      if (body) {
        setItems((prev) => [...prev, ...body.items])
        setHasMore(body.hasMore)
        setNextBefore(body.nextBefore)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <Surface className="mt-6 overflow-hidden">
      <div className="border-b border-border p-4">
        <h3 className="font-semibold text-foreground">{t("analytics.attackerTimeline.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("analytics.attackerTimeline.description")}</p>
      </div>

      {status === "loading" ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-blue-400" />
        </div>
      ) : status === "unavailable" ? (
        <EmptyState icon="activity" title={t("analytics.unavailable.title")} description={t("analytics.unavailable.description")} />
      ) : status === "error" ? (
        <ErrorState />
      ) : items.length === 0 ? (
        <EmptyState title={t("analytics.attackerTimeline.empty")} />
      ) : (
        <>
          <div className="max-h-[500px] overflow-y-auto divide-y divide-border">
            {items.map((item) => {
              const Icon = SOURCE_ICON[item.source]
              return (
                <div key={item.eventId} className="flex items-start gap-3 px-4 py-2.5">
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${SOURCE_COLOR[item.source]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{item.summary}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatInTimezone(chTimestampToIso(item.timestamp), tz, FULL_TIMESTAMP_OPTS)} · {t(SOURCE_LABEL_KEY[item.source])} · {item.sensorId}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
          {hasMore && (
            <div className="border-t border-border p-3 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
              >
                {loadingMore ? "…" : t("analytics.attackerTimeline.loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </Surface>
  )
}
