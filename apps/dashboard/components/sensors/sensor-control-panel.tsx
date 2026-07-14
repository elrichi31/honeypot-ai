"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RadioTower } from "lucide-react"
import { apiFetch, assertOk } from "@/lib/client-fetch"
import { useLiveStream } from "@/hooks/use-live-stream"
import { useT } from "@/components/locale-provider"

type StatusResult = {
  agentVersion: string
  uptimeSeconds: number
  pid?: number
  ports: number[]
  configHash: string | null
}

type CommandPhase = "idle" | "queued" | "running"

// WS control-plane presence for status.get (Rebanada 3+4, docs/plans/
// SENSOR_REMOTE_CONTROL.md). Distinct signal from the HTTP heartbeat badge in
// SensorHeader: a sensor can be heartbeating (online) while its control-plane
// socket is down (agent not started, wrong credential, network split).
export function SensorControlPanel({ sensorId }: { sensorId: string }) {
  const t = useT()
  const [configured, setConfigured] = useState(true)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [phase, setPhase] = useState<CommandPhase>("idle")
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null)
  const [result, setResult] = useState<StatusResult | null>(null)
  const [error, setError] = useState("")

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/sensors/${encodeURIComponent(sensorId)}/control-status`, { cache: "no-store" })
      if (res.status === 503) { setConfigured(false); return }
      if (!res.ok) return
      const data = await res.json() as { connected: boolean }
      setConnected(data.connected)
    } catch { /* offline dashboard fetch, next poll/SSE event will catch up */ }
  }, [sensorId])

  const fetchLatestResult = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/sensors/${encodeURIComponent(sensorId)}/commands?limit=1`, { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json() as { commands: Array<{ status: string; result: StatusResult | null; error: { message: string } | null }> }
      const latest = data.commands[0]
      if (!latest) return
      if (latest.status === "succeeded") { setResult(latest.result); setError("") }
      else if (latest.status === "failed") setError(latest.error?.message ?? t("sensors.control.error"))
    } catch { /* ignore, SSE will re-trigger on the next event */ }
  }, [sensorId, t])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  useLiveStream({
    onSensorControlPresence: (event) => {
      if (event.sensorId !== sensorId) return
      setConnected(event.type === "sensor.connected")
    },
    onCommandLifecycle: (event) => {
      if (event.sensorId !== sensorId || event.commandId !== pendingCommandId) return
      if (event.type === "command.acked") setPhase("running")
      if (event.type === "command.result") {
        setPhase("idle")
        setPendingCommandId(null)
        fetchLatestResult()
      }
    },
  })

  async function handleStatusGet() {
    setPhase("queued")
    setError("")
    try {
      const res = await assertOk(await apiFetch(`/api/sensors/${encodeURIComponent(sensorId)}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status.get", payload: {} }),
      }), t("sensors.control.error"))
      const data = await res.json() as { command: { id: string } }
      setPendingCommandId(data.command.id)
    } catch (err) {
      setPhase("idle")
      setError(err instanceof Error ? err.message : t("sensors.control.error"))
    }
  }

  if (!configured) return null

  const busy = phase !== "idle"

  return (
    <div className="border-t border-border/50 pt-2.5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? "bg-sky-400" : "bg-muted-foreground/40"}`} />
          </span>
          <span className={`text-xs font-medium ${connected ? "text-sky-400" : "text-muted-foreground"}`}>
            {connected ? t("sensors.control.connected") : t("sensors.control.disconnected")}
          </span>
        </div>
        <button
          onClick={handleStatusGet}
          disabled={busy}
          title={t("sensors.control.checkStatus")}
          className="flex items-center gap-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-sky-400/15 hover:text-sky-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RadioTower className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <p className="text-[10px] font-medium text-destructive">{error}</p>}
      {result && !error && (
        <p className="text-[10px] font-mono text-muted-foreground truncate">
          {t("sensors.control.result", { version: result.agentVersion, uptime: String(result.uptimeSeconds) })}
        </p>
      )}
    </div>
  )
}
