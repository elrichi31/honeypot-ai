"use client"

import { apiFetch } from "@/lib/client-fetch"

import { useState, useEffect } from "react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SlidersHorizontal } from "lucide-react"
import { SaveFeedback, CardHeader, type SaveStatus } from "./setting-card"

interface AlertEnabledTypes {
  threatScore: boolean
  multiService: boolean
  authBurst: boolean
  postAuth: boolean
  attackChain: boolean
  sensorOffline: boolean
}

interface AlertConfig {
  alertMinLevel: "critical" | "high"
  alertCooldownMinutes: number
  alertEnabledTypes: AlertEnabledTypes
  reportIntervalHours: number
}

const ALERT_TYPE_LABELS: { key: keyof AlertEnabledTypes; label: string; description: string }[] = [
  { key: "threatScore",   label: "Amenaza crítica",              description: "Score de riesgo ≥ 80/100" },
  { key: "multiService",  label: "Multi-servicio",               description: "3+ protocolos distintos en 10 min" },
  { key: "authBurst",     label: "Ráfaga de autenticación",      description: "12+ intentos en 5 min" },
  { key: "postAuth",      label: "Login exitoso + comandos",     description: "Autenticó y ejecutó comandos sospechosos" },
  { key: "attackChain",   label: "Cadena de ataque",             description: "Scan → exploit → auth en secuencia" },
  { key: "sensorOffline", label: "Sensor offline",               description: "Sensor sin heartbeat por más de 2 min" },
]

const REPORT_INTERVAL_OPTIONS = [
  { value: 0,  label: "Desactivado" },
  { value: 4,  label: "Cada 4 horas" },
  { value: 8,  label: "Cada 8 horas" },
  { value: 12, label: "Cada 12 horas" },
  { value: 24, label: "Una vez al día" },
]

const DEFAULT_CONFIG: AlertConfig = {
  alertMinLevel: "critical",
  alertCooldownMinutes: 60,
  alertEnabledTypes: {
    threatScore: true,
    multiService: true,
    authBurst: true,
    postAuth: true,
    attackChain: true,
    sensorOffline: true,
  },
  reportIntervalHours: 8,
}

export function AlertsForm() {
  const [cfg, setCfg] = useState<AlertConfig>(DEFAULT_CONFIG)
  const [status, setStatus] = useState<SaveStatus>("loading")
  const [error, setError] = useState("")

  useEffect(() => {
    apiFetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setCfg({
          alertMinLevel: d.alertMinLevel ?? "critical",
          alertCooldownMinutes: d.alertCooldownMinutes ?? 60,
          alertEnabledTypes: d.alertEnabledTypes ?? DEFAULT_CONFIG.alertEnabledTypes,
          reportIntervalHours: d.reportIntervalHours ?? 8,
        })
        setStatus("idle")
      })
      .catch(() => setStatus("idle"))
  }, [])

  function toggleType(key: keyof AlertEnabledTypes) {
    setCfg((prev) => ({
      ...prev,
      alertEnabledTypes: { ...prev.alertEnabledTypes, [key]: !prev.alertEnabledTypes[key] },
    }))
  }

  async function save() {
    setStatus("saving")
    setError("")
    try {
      const res = await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertMinLevel: cfg.alertMinLevel,
          alertCooldownMinutes: cfg.alertCooldownMinutes,
          alertEnabledTypes: cfg.alertEnabledTypes,
          reportIntervalHours: cfg.reportIntervalHours,
        }),
      })
      if (!res.ok) throw new Error()
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 3000)
    } catch {
      setError("No se pudo guardar.")
      setStatus("error")
    }
  }

  const loading = status === "loading"

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader
        icon={SlidersHorizontal}
        iconBg="bg-orange-500/20"
        iconColor="text-orange-400"
        title="Configuración de alertas"
        description="Controla qué eventos generan notificaciones y con qué frecuencia"
      />

      <div className="space-y-6 p-4">

        {/* Nivel mínimo */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Nivel mínimo de alerta</Label>
          <div className="flex gap-2">
            {(["critical", "high"] as const).map((level) => (
              <button
                key={level}
                disabled={loading}
                onClick={() => setCfg((prev) => ({ ...prev, alertMinLevel: level }))}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  cfg.alertMinLevel === level
                    ? level === "critical"
                      ? "border-red-500 bg-red-500/10 text-red-400"
                      : "border-orange-500 bg-orange-500/10 text-orange-400"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {level === "critical" ? "Solo CRITICAL" : "HIGH y CRITICAL"}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            CRITICAL = score ≥ 80. HIGH = score ≥ 60. Recomendado: Solo CRITICAL para menos ruido.
          </p>
        </div>

        {/* Tipos de alerta */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Tipos de alerta activos</Label>
          <div className="rounded-lg border border-border divide-y divide-border">
            {ALERT_TYPE_LABELS.map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <Switch
                  checked={cfg.alertEnabledTypes[key]}
                  onCheckedChange={() => toggleType(key)}
                  disabled={loading}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Cooldown */}
        <div className="space-y-2">
          <Label htmlFor="cooldown" className="text-sm font-medium">Cooldown por IP (minutos)</Label>
          <div className="flex items-center gap-3">
            <Input
              id="cooldown"
              type="number"
              min={1}
              max={1440}
              value={cfg.alertCooldownMinutes}
              onChange={(e) => setCfg((prev) => ({ ...prev, alertCooldownMinutes: Number(e.target.value) || 60 }))}
              disabled={loading}
              className="w-28"
            />
            <span className="text-xs text-muted-foreground">
              Una vez alertada una IP, no se vuelve a notificar hasta que pase este tiempo.
            </span>
          </div>
        </div>

        {/* Informe automático */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Informe automático a Discord</Label>
          <div className="flex flex-wrap gap-2">
            {REPORT_INTERVAL_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                disabled={loading}
                onClick={() => setCfg((prev) => ({ ...prev, reportIntervalHours: value }))}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  cfg.reportIntervalHours === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Resumen de actividad enviado a Discord. Si no hubo actividad en el período, no se envía nada.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button
            onClick={save}
            disabled={status === "saving" || loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {status === "saving" ? "Guardando..." : status === "saved" ? "Guardado" : "Guardar"}
          </Button>
          <SaveFeedback status={status} error={error} />
        </div>
      </div>
    </div>
  )
}
