"use client"

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, HardDrive, Loader2, RefreshCw } from "lucide-react"
import { CardHeader } from "./setting-card"

type OvaConfig = { ingestUrl: string; ip: string; port: string; source: string }

const SOURCE_LABEL: Record<string, string> = {
  "SENSOR_INGEST_URL":   "SENSOR_INGEST_URL variable",
  "NEXT_PUBLIC_API_URL": "NEXT_PUBLIC_API_URL variable",
  "auto-detected":       "Auto-detected public IP",
}

export function OvaConfigCard() {
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
      .catch(() => setError("Could not fetch the configuration"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader
        icon={HardDrive}
        iconBg="bg-violet-400/20"
        iconColor="text-violet-400"
        title="Ingest API"
        description="Automatically detected public URL — the one sensors use to connect"
      />

      <div className="p-4 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Detecting the server's public IP…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p>{error}</p>
              <p className="text-xs opacity-80">
                You can force a value with <code className="font-mono">SENSOR_INGEST_URL=http://&lt;ip&gt;:3000</code> in your .env
              </p>
            </div>
          </div>
        )}

        {config && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border divide-y divide-border">
              <Row label="Ingest URL" value={config.ingestUrl} mono />
              <Row label="Public IP" value={config.ip} mono />
              <Row label="Port" value={config.port} mono />
              <Row
                label="Source"
                value={
                  <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {SOURCE_LABEL[config.source] ?? config.source}
                  </span>
                }
              />
            </div>

            {config.source === "auto-detected" && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2.5 text-xs text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Port <strong>{config.port}</strong> must be open in the server firewall so the sensor can connect.
                  Run: <code className="font-mono">ufw allow {config.port}/tcp</code>
                </span>
              </div>
            )}

            <button
              onClick={load}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Re-detect
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
