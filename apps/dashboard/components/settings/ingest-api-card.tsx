"use client"

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, HardDrive, Loader2, RefreshCw } from "lucide-react"
import { CardHeader } from "./setting-card"
import { useT } from "@/components/locale-provider"
import type { TranslationKey } from "@/lib/i18n/dictionaries"

type OvaConfig = { ingestUrl: string; ip: string; port: string; source: string }

const SOURCE_LABEL_KEY: Record<string, string> = {
  "SENSOR_INGEST_URL":   "set.infra.srcSensorVar",
  "NEXT_PUBLIC_API_URL": "set.infra.srcPublicVar",
  "auto-detected":       "set.infra.srcAuto",
}

export function OvaConfigCard() {
  const t = useT()
  const [config, setConfig]   = useState<OvaConfig | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    setError(null)
    fetch("/api/ova/config")
      .then(r => r.json())
      .then((d: OvaConfig & { error?: string }) => {
        if (d.error) setError(d.error)
        else setConfig(d)
      })
      .catch(() => setError(t("set.ingestApi.fetchError")))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader
        icon={HardDrive}
        iconBg="bg-violet-400/20"
        iconColor="text-violet-400"
        title={t("set.ingestApi.title")}
        description={t("set.ingestApi.description")}
      />

      <div className="p-4 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("set.ingestApi.detecting")}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p>{error}</p>
              <p className="text-xs opacity-80">
                {t("set.ingestApi.forceHint")}
              </p>
            </div>
          </div>
        )}

        {config && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border divide-y divide-border">
              <Row label={t("set.infra.rowIngestUrl")} value={config.ingestUrl} mono />
              <Row label={t("set.infra.rowPublicIp")} value={config.ip} mono />
              <Row label={t("set.infra.rowPort")} value={config.port} mono />
              <Row
                label={t("set.infra.rowSource")}
                value={
                  <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t((SOURCE_LABEL_KEY[config.source] ?? config.source) as TranslationKey)}
                  </span>
                }
              />
            </div>

            {config.source === "auto-detected" && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2.5 text-xs text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Port <strong>{config.port}</strong> {t("set.ingestApi.firewallNote")} <code className="font-mono">ufw allow {config.port}/tcp</code>
                </span>
              </div>
            )}

            <button
              onClick={load}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              {t("set.common.reDetect")}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      {mono
        ? <code className="font-mono text-xs text-foreground truncate">{value as string}</code>
        : <div className="text-right">{value}</div>
      }
    </div>
  )
}
