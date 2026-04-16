"use client"

import { useState } from "react"
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  Bug,
  Crosshair,
  Download,
  Eye,
  Cpu,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { HoneypotEvent, ApiSessionDetail } from "@/lib/api"
import type { SessionAnalysis } from "@/app/api/ai/session-summary/route"

interface AiSummaryProps {
  session: ApiSessionDetail
  events: HoneypotEvent[]
}

const CLASSIFICATION_META: Record<
  string,
  { label: string; icon: typeof Bug; color: string; bg: string }
> = {
  "brute-force bot": {
    label: "Brute-force bot",
    icon: Cpu,
    color: "text-orange-400",
    bg: "bg-orange-400/10 border-orange-400/30",
  },
  "opportunistic scanner": {
    label: "Opportunistic scanner",
    icon: Crosshair,
    color: "text-yellow-400",
    bg: "bg-yellow-400/10 border-yellow-400/30",
  },
  "interactive operator": {
    label: "Interactive operator",
    icon: Eye,
    color: "text-red-400",
    bg: "bg-red-400/10 border-red-400/30",
  },
  "malware dropper": {
    label: "Malware dropper",
    icon: Download,
    color: "text-destructive",
    bg: "bg-destructive/10 border-destructive/30",
  },
  "recon-only": {
    label: "Recon only",
    icon: Eye,
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/30",
  },
  "credential stuffing": {
    label: "Credential stuffing",
    icon: ShieldAlert,
    color: "text-purple-400",
    bg: "bg-purple-400/10 border-purple-400/30",
  },
}

const RISK_META: Record<string, { color: string; bar: string; bg: string }> = {
  Low:      { color: "text-green-400",  bar: "bg-green-400",  bg: "bg-green-400/10" },
  Medium:   { color: "text-yellow-400", bar: "bg-yellow-400", bg: "bg-yellow-400/10" },
  High:     { color: "text-orange-400", bar: "bg-orange-400", bg: "bg-orange-400/10" },
  Critical: { color: "text-red-500",    bar: "bg-red-500",    bg: "bg-red-500/10" },
}

function RiskGauge({ score, level }: { score: number; level: string }) {
  const meta = RISK_META[level] ?? RISK_META.Low
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Risk score</span>
        <span className={cn("font-bold text-base", meta.color)}>{score}/100</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full transition-all duration-700", meta.bar)}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0 — Low</span><span>50 — High</span><span>100 — Critical</span>
      </div>
    </div>
  )
}

export function AiSummary({ session, events }: AiSummaryProps) {
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/ai/session-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, events }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAnalysis(data as SessionAnalysis)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
    } finally {
      setLoading(false)
    }
  }

  const classMeta = analysis
    ? (CLASSIFICATION_META[analysis.classification] ?? CLASSIFICATION_META["opportunistic scanner"])
    : null
  const riskMeta = analysis ? (RISK_META[analysis.riskLevel] ?? RISK_META.Low) : null
  const ClassIcon = classMeta?.icon ?? Bug

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">AI Threat Analysis</h3>
            <p className="text-xs text-muted-foreground">GPT-4o mini · análisis estructurado</p>
          </div>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            analysis
              ? "bg-secondary text-muted-foreground hover:text-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
            loading && "cursor-not-allowed opacity-60"
          )}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : analysis ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {loading ? "Analizando..." : analysis ? "Regenerar" : "Analizar sesión"}
        </button>
      </div>

      <div className="p-4">
        {/* Empty state */}
        {!analysis && !loading && !error && (
          <p className="text-sm text-muted-foreground">
            Haz clic en <strong>"Analizar sesión"</strong> para obtener resumen, clasificación,
            risk score e indicadores clave generados por IA.
          </p>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analizando comandos, credenciales y patrones de comportamiento...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Analysis */}
        {analysis && classMeta && riskMeta && (
          <div className="space-y-4">
            {/* Classification + Risk level row */}
            <div className="flex flex-wrap gap-3">
              <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", classMeta.bg)}>
                <ClassIcon className={cn("h-4 w-4", classMeta.color)} />
                <span className={cn("text-sm font-semibold", classMeta.color)}>
                  {classMeta.label}
                </span>
              </div>
              <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2", riskMeta.bg)}>
                <ShieldAlert className={cn("h-4 w-4", riskMeta.color)} />
                <span className={cn("text-sm font-semibold", riskMeta.color)}>
                  {analysis.riskLevel} risk
                </span>
              </div>
            </div>

            {/* Risk gauge */}
            <RiskGauge score={analysis.riskScore} level={analysis.riskLevel} />

            {/* Risk breakdown */}
            {analysis.riskBreakdown.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Factores de riesgo
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.riskBreakdown.map((b, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {b.label}
                      <span className={cn("ml-1 font-semibold", riskMeta.color)}>
                        +{b.points}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="rounded-lg border border-border bg-secondary/40 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Resumen
              </p>
              <p className="text-sm text-foreground leading-relaxed">{analysis.summary}</p>
            </div>

            {/* Key indicators */}
            {analysis.keyIndicators.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Indicadores clave
                </p>
                <ul className="space-y-1">
                  {analysis.keyIndicators.map((ind, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <span className={cn("mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full", riskMeta.bar)} />
                      {ind}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendation */}
            {analysis.recommendation && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="mb-1 text-xs font-medium text-primary uppercase tracking-wide">
                  Recomendación
                </p>
                <p className="text-sm text-foreground">{analysis.recommendation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
