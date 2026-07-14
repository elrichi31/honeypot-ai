"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Loader2, RadioTower } from "lucide-react"
import { apiFetch, assertOk } from "@/lib/client-fetch"
import { useLiveStream } from "@/hooks/use-live-stream"
import { useT } from "@/components/locale-provider"
import { useViewer, canActOnSensor } from "@/hooks/use-viewer"

type StatusResult = {
  agentVersion: string
  uptimeSeconds: number
  pid?: number
  ports: number[]
  configHash: string | null
}

type CommandPhase = "idle" | "queued" | "running"

type CommandSummary = {
  id: string
  action: string
  status: string
  error: { message: string } | null
}

const HISTORY_LIMIT = 8
const TERMINAL_STATUS_COLOR: Record<string, string> = {
  succeeded: "text-emerald-400",
  failed: "text-red-400",
  expired: "text-amber-400",
  cancelled: "text-muted-foreground",
}

// WS control-plane presence for status.get (Rebanada 3+4, docs/plans/
// SENSOR_REMOTE_CONTROL.md). Distinct signal from the HTTP heartbeat badge in
// SensorHeader: a sensor can be heartbeating (online) while its control-plane
// socket is down (agent not started, wrong credential, network split).
export function SensorControlPanel({ sensorId, sensorClientId }: { sensorId: string; sensorClientId?: string | null }) {
  const t = useT()
  const viewer = useViewer()
  const canTrigger = canActOnSensor(viewer, "analyst", sensorClientId)
  const [configured, setConfigured] = useState(true)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [phase, setPhase] = useState<CommandPhase>("idle")
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null)
  const [result, setResult] = useState<StatusResult | null>(null)
  const [error, setError] = useState("")
  const [history, setHistory] = useState<CommandSummary[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/sensors/${encodeURIComponent(sensorId)}/control-status`, { cache: "no-store" })
      if (res.status === 503) { setConfigured(false); return }
      if (!res.ok) return
      const data = await res.json() as { connected: boolean; capabilities: string[] }
      setConnected(data.connected)
      setCapabilities(data.capabilities ?? [])
    } catch { /* offline dashboard fetch, next poll/SSE event will catch up */ }
  }, [sensorId])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/sensors/${encodeURIComponent(sensorId)}/commands?limit=${HISTORY_LIMIT}`, { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json() as { commands: Array<CommandSummary & { result: StatusResult | null }> }
      setHistory(data.commands)
      const latest = data.commands[0]
      if (!latest) return
      if (latest.status === "succeeded") { setResult(latest.result); setError("") }
      else if (latest.status === "failed") setError(latest.error?.message ?? t("sensors.control.error"))
    } catch { /* ignore, SSE will re-trigger on the next event */ }
  }, [sensorId, t])

  useEffect(() => { fetchStatus(); fetchHistory() }, [fetchStatus, fetchHistory])

  useLiveStream({
    onSensorControlPresence: (event) => {
      if (event.sensorId !== sensorId) return
      setConnected(event.type === "sensor.connected")
      // Capabilities travel in the raw SSE payload but aren't part of this
      // narrow event type — re-fetch control-status instead of widening it.
      if (event.type === "sensor.connected") fetchStatus()
      else setCapabilities([])
    },
    onCommandLifecycle: (event) => {
      if (event.sensorId !== sensorId) return
      if (event.commandId === pendingCommandId) {
        if (event.type === "command.acked") setPhase("running")
        if (event.type === "command.result") {
          setPhase("idle")
          setPendingCommandId(null)
        }
      }
      if (event.type === "command.result" || event.type === "command.sent") fetchHistory()
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
        {canTrigger && (
          <button
            onClick={handleStatusGet}
            disabled={busy}
            title={t("sensors.control.checkStatus")}
            className="flex items-center gap-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-sky-400/15 hover:text-sky-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RadioTower className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {connected && capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {capabilities.map((cap) => (
            <span key={cap} className="rounded bg-muted/50 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
              {cap}
            </span>
          ))}
        </div>
      )}
      {error && <p className="text-[10px] font-medium text-destructive">{error}</p>}
      {result && !error && (
        <p className="text-[10px] font-mono text-muted-foreground truncate">
          {t("sensors.control.result", { version: result.agentVersion, uptime: String(result.uptimeSeconds) })}
          {result.configHash && ` · ${result.configHash.slice(0, 8)}`}
        </p>
      )}
      {history.length > 0 && (
        <div>
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {historyOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {t("sensors.control.history")}
          </button>
          {historyOpen && (
            <ul className="mt-1 space-y-0.5">
              {history.map((cmd) => (
                <li key={cmd.id} className="flex items-center justify-between gap-2 text-[10px] font-mono">
                  <span className="text-muted-foreground truncate">{cmd.action}</span>
                  <span className={TERMINAL_STATUS_COLOR[cmd.status] ?? "text-amber-400"}>{cmd.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
