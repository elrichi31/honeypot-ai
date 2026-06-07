"use client"

import { apiFetch } from "@/lib/client-fetch"
import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Clock, CheckCircle, Loader2 } from "lucide-react"
import { SaveFeedback, CardHeader, type SaveStatus } from "./setting-card"

export function SessionConfigForm() {
  const [hours, setHours] = useState("8")
  const [status, setStatus] = useState<SaveStatus>("loading")
  const [error, setError] = useState("")

  useEffect(() => {
    apiFetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setHours(String(d.sessionDurationHours ?? 8))
        setStatus("idle")
      })
      .catch(() => setStatus("idle"))
  }, [])

  async function save() {
    setStatus("saving")
    setError("")
    try {
      const res = await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionDurationHours: Number(hours) }),
      })
      if (!res.ok) throw new Error()
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 3000)
    } catch {
      setError("No se pudo guardar.")
      setStatus("error")
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader
        icon={Clock}
        iconBg="bg-indigo-500/20"
        iconColor="text-indigo-400"
        title="Duración de sesión"
        description="Cuánto tiempo permanece válida una sesión de inicio de sesión en el dashboard."
      />

      <div className="space-y-3 p-4">
        <Label htmlFor="session-hours">Horas (1 – 720)</Label>
        <div className="flex gap-2">
          {status === "loading" ? (
            <div className="flex h-10 flex-1 items-center rounded-md border border-border bg-secondary px-3 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Cargando...
            </div>
          ) : (
            <Input
              id="session-hours"
              type="number"
              min={1}
              max={720}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              className="flex-1 font-mono text-sm"
            />
          )}
          <Button
            onClick={save}
            disabled={status === "saving" || status === "loading"}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {status === "saving" ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Guardando</> : status === "saved" ? <><CheckCircle className="mr-1.5 h-3.5 w-3.5" />Guardado</> : "Guardar"}
          </Button>
        </div>
        <SaveFeedback status={status} error={error} />
        <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          El cambio aplica a las <strong>nuevas</strong> sesiones tras reiniciar el dashboard. Las
          sesiones existentes conservan su expiración; puedes forzarlas desde
          <span className="font-mono"> Administration → Sessions</span>.
        </div>
      </div>
    </div>
  )
}
