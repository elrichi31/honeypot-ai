"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Settings2 } from "lucide-react"
import { isPrivateIp } from "@/lib/sensor-display"
import { SensorHeader } from "./sensor-header"
import { SensorStats } from "./sensor-stats"
import { SensorPorts } from "./sensor-ports"
import { SensorActions } from "./sensor-actions"
import { SensorConfigDialog } from "./sensor-config-dialog"
import type { ControlAction, ControlState } from "./sensor-actions"
import type { Sensor } from "@/lib/api"

const CONTROL_RESET_DELAY = 3000
const CONTROL_ERROR_DELAY = 4000
const DOCKER_CONFIRM_DELAY = 2000
const DOCKER_POLL_INTERVAL = 30000

function optimisticDockerStatus(action: ControlAction): string {
  if (action === "stop") return "exited"
  return "running"
}

function controlLabel(action: ControlAction): string {
  if (action === "stop") return "Detenido"
  if (action === "start") return "Iniciado"
  return "Reiniciado"
}

export function SensorCard({
  sensor,
  clientCode,
  honeypotPublicIp,
}: {
  sensor: Sensor
  clientCode?: string
  honeypotPublicIp?: string
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [controlState, setControlState] = useState<ControlState>("idle")
  const [controlMsg, setControlMsg] = useState("")
  const [dockerStatus, setDockerStatus] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

  const isConfigurable = sensor.protocol === "ssh"

  const hasContainer = !!sensor.probeHost
  const isInternal = isPrivateIp(sensor.ip)

  // A sensor is "remote" when it reports heartbeats (online) but the dashboard
  // host can't manage its container locally — the Docker probe comes back as
  // not-found/socket-unavailable/unmanaged/unknown. For these, container
  // controls and port probes don't apply (it lives on another host/network),
  // so we show it as a healthy remote sensor instead of an alarming error.
  // dockerStatus === null means "still loading", which is NOT treated as remote.
  const NON_LOCAL_DOCKER = new Set(["socket_unavailable", "unmanaged", "not_found", "unknown"])
  const isRemote = sensor.online && dockerStatus !== null && NON_LOCAL_DOCKER.has(dockerStatus)

  const fetchDockerStatus = useCallback(async (signal?: AbortSignal) => {
    if (!hasContainer) return
    try {
      const res = await fetch(`/api/sensors/${encodeURIComponent(sensor.sensorId)}/control`, { cache: "no-store", signal })
      if (res.ok) {
        const data = await res.json()
        setDockerStatus(data.status ?? null)
      }
    } catch { /* ignore aborts and errors */ }
  }, [sensor.sensorId, hasContainer])

  useEffect(() => {
    const controller = new AbortController()
    fetchDockerStatus(controller.signal)
    const id = setInterval(() => {
      const ctrl = new AbortController()
      fetchDockerStatus(ctrl.signal)
    }, DOCKER_POLL_INTERVAL)
    return () => { controller.abort(); clearInterval(id) }
  }, [fetchDockerStatus])

  async function handleDelete() {
    setDeleting(true)
    setDeleteError("")
    try {
      const res = await fetch(`/api/sensors/${encodeURIComponent(sensor.sensorId)}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeleteError(data.error ?? `Error ${res.status}`)
        setDeleting(false)
        return
      }
      // Success: refresh the list. The card disappears, so no success message needed.
      router.refresh()
    } catch {
      setDeleteError("No se pudo conectar")
      setDeleting(false)
    }
  }

  async function handleControl(action: ControlAction) {
    setControlState("loading")
    setControlMsg("")
    try {
      const res = await fetch(`/api/sensors/${encodeURIComponent(sensor.sensorId)}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (res.ok) {
        setControlState("ok")
        setControlMsg(controlLabel(action))
        setDockerStatus(optimisticDockerStatus(action))
        setTimeout(() => fetchDockerStatus(), DOCKER_CONFIRM_DELAY)
        setTimeout(() => { setControlState("idle"); router.refresh() }, CONTROL_RESET_DELAY)
      } else {
        setControlState("error")
        setControlMsg(data.error ?? "Error")
        setTimeout(() => setControlState("idle"), CONTROL_ERROR_DELAY)
      }
    } catch {
      setControlState("error")
      setControlMsg("No se pudo conectar")
      setTimeout(() => setControlState("idle"), CONTROL_ERROR_DELAY)
    }
  }

  return (
    <div className={`rounded-xl border bg-card p-4 flex flex-col gap-3 transition-colors ${sensor.online ? "border-border" : "border-border/40 opacity-70"}`}>
      <SensorHeader sensor={sensor} dockerStatus={dockerStatus} isRemote={isRemote} deleting={deleting} onDelete={handleDelete} />
      {deleteError && (
        <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] font-medium text-destructive">
          No se pudo eliminar: {deleteError}
        </p>
      )}
      <SensorStats sensor={sensor} isInternal={isInternal} honeypotPublicIp={honeypotPublicIp} clientCode={clientCode} />
      <SensorPorts sensor={sensor} isInternal={isInternal} isRemote={isRemote} />
      {sensor.version && (
        <div className="rounded-md bg-muted/40 px-2.5 py-1">
          <p className="text-[10px] font-mono text-muted-foreground">v{sensor.version}</p>
        </div>
      )}
      {isConfigurable && (
        <button
          onClick={() => setConfigOpen(true)}
          className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground w-full justify-center"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Configure
        </button>
      )}
      {hasContainer && !isRemote && (
        <SensorActions controlState={controlState} controlMsg={controlMsg} onControl={handleControl} />
      )}
      {isConfigurable && (
        <SensorConfigDialog
          sensorId={sensor.sensorId}
          open={configOpen}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  )
}
