"use client"

import { useEffect, useState } from "react"
import { Bot, Cpu, ShieldAlert, Sparkles, RefreshCw, Loader2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { ThreatDetail } from "@/lib/api"
import type { ThreatAnalysis } from "@/app/api/ai/threat-analysis/route"

const SOPHISTICATION_LABELS: Record<string, { label: string; color: string }> = {
  "script-kiddie":    { label: "Script Kiddie",    color: "bg-green-500/15 text-green-400 border-green-500/30" },
  "organized-crime":  { label: "Crimen Organizado", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  "apt-like":         { label: "APT-like",          color: "bg-red-500/15 text-red-400 border-red-500/30" },
}

interface Props {
  ip: string
  threat: ThreatDetail
  initialAnalysis: ThreatAnalysis | null
  autoTrigger: boolean
}

export function AiThreatSummary({ ip, threat, initialAnalysis, autoTrigger }: Props) {
  const [analysis, setAnalysis] = useState<ThreatAnalysis | null>(initialAnalysis)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/ai/threat-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, threat }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      setAnalysis(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!initialAnalysis && autoTrigger) run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const soph = analysis ? (SOPHISTICATION_LABELS[analysis.sophistication] ?? SOPHISTICATION_LABELS["script-kiddie"]) : null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <h3 className="font-semibold text-foreground">AI Threat Intelligence</h3>
        </div>
        <div className="flex items-center gap-2">
          {analysis && (
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(analysis.analyzedAt), { addSuffix: true })}
            </span>
          )}
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-50"
          >
            {loading
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RefreshCw className="h-3 w-3" />}
            {analysis ? "Re-analizar" : "Analizar"}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && !analysis && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analizando con IA…
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="p-4 text-sm text-destructive">
          Error: {error}
        </div>
      )}

      {/* Empty state */}
      {!analysis && !loading && !error && (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Bot className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {autoTrigger ? "Iniciando análisis…" : "Haz clic en Analizar para generar el perfil de este actor"}
          </p>
        </div>
      )}

      {/* Result */}
      {analysis && (
        <div className="divide-y divide-border">
          {/* Profile + sophistication */}
          <div className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-foreground leading-relaxed">{analysis.actorProfile}</p>
              {soph && (
                <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${soph.color}`}>
                  {soph.label}
                </span>
              )}
            </div>
          </div>

          {/* Intent */}
          <div className="px-4 py-3">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Intención</p>
            <p className="text-sm text-foreground">{analysis.intent}</p>
          </div>

          {/* Tactics */}
          {analysis.keyTactics.length > 0 && (
            <div className="px-4 py-3">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Tácticas clave</p>
              <ul className="space-y-1">
                {analysis.keyTactics.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendation */}
          <div className="px-4 py-3">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Recomendación</p>
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm text-foreground">{analysis.recommendation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
