"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle, CheckCircle2, Database, Globe, Network, Server,
  WifiOff, XCircle, Trash2, Loader2, Play, Square, RotateCcw, Lock,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { Sensor } from "@/lib/api"

const PROTOCOL_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  ssh:        { label: "SSH",       icon: Server,  color: "text-cyan-400",   bg: "bg-cyan-400/10"   },
  ftp:        { label: "FTP",       icon: Server,  color: "text-yellow-400", bg: "bg-yellow-400/10" },
  mysql:      { label: "MySQL",     icon: Database,color: "text-purple-400", bg: "bg-purple-400/10" },
  "port-scan":{ label: "Port Scan", icon: Network, color: "text-blue-400",   bg: "bg-blue-400/10"   },
  http:       { label: "HTTP",      icon: Globe,   color: "text-green-400",  bg: "bg-green-400/10"  },
  dionaea:    { label: "Dionaea",   icon: Network, color: "text-red-400",    bg: "bg-red-400/10"    },
  smb:        { label: "SMB",       icon: Server,  color: "text-orange-400", bg: "bg-orange-400/10" },
  mssql:      { label: "MSSQL",     icon: Database,color: "text-pink-400",   bg: "bg-pink-400/10"   },
  rpc:        { label: "RPC",       icon: Network, color: "text-indigo-400", bg: "bg-indigo-400/10" },
  tftp:       { label: "TFTP",      icon: Server,  color: "text-lime-400",   bg: "bg-lime-400/10"   },
  mqtt:       { label: "MQTT",      icon: Network, color: "text-teal-400",   bg: "bg-teal-400/10"   },
  deception:  { label: "Deception", icon: Lock,    color: "text-violet-400", bg: "bg-violet-400/10" },
}

// RFC 1918 private ranges
function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "-") return false
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return false
  const [a, b] = v4.split(".").map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function formatRelative(value: string | null | undefined) {
  if (!value || new Date(value).getTime() === 0) return "-"
  const diff = Date.now() - new Date(value).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

type ControlAction = "start" | "stop" | "restart"
type ControlState = "idle" | "loading" | "ok" | "error"

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
  const [controlState, setControlState] = useState<ControlState>("idle")
  const [controlMsg, setControlMsg] = useState("")

  const meta = PROTOCOL_META[sensor.protocol] ?? {
    label: sensor.protocol, icon: Server, color: "text-slate-400", bg: "bg-slate-400/10",
  }
  const Icon = meta.icon

  const isInternal = isPrivateIp(sensor.ip)
  const hasContainer = !!sensor.probeHost

  async function handleDelete() {
    setDeleting(true)
    try {
      await fetch(`/api/sensors/${encodeURIComponent(sensor.sensorId)}`, { method: "DELETE" })
      router.refresh()
    } finally {
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
        setControlMsg(action === "stop" ? "Detenido" : action === "start" ? "Iniciado" : "Reiniciado")
        setTimeout(() => { setControlState("idle"); router.refresh() }, 2000)
      } else {
        setControlState("error")
        setControlMsg(data.error ?? "Error")
        setTimeout(() => setControlState("idle"), 4000)
      }
    } catch {
      setControlState("error")
      setControlMsg("No se pudo conectar")
      setTimeout(() => setControlState("idle"), 4000)
    }
  }

  return (
    <div className={`rounded-xl border bg-card p-4 flex flex-col gap-3 transition-colors ${sensor.online ? "border-border" : "border-border/40 opacity-70"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}>
            <Icon className={`h-4 w-4 ${meta.color}`} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm truncate">{sensor.name}</p>
            <p className={`text-xs font-medium ${meta.color}`}>{meta.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sensor.online ? (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-xs font-medium text-emerald-400">Online</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <WifiOff className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Offline</span>
            </div>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="rounded p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete sensor"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete sensor?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove <span className="font-medium text-foreground">{sensor.name}</span>{" "}
                  (<code className="font-mono text-xs">{sensor.sensorId}</code>) from the dashboard.
                  <br /><br />
                  <span className="text-amber-400 font-medium">
                    All events associated with this sensor ID will also be permanently deleted.
                  </span>{" "}
                  This cannot be undone. If the sensor is still running it will re-register on the next heartbeat.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete sensor &amp; events
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        {/* IP section — shows internal + external when applicable */}
        <div className="col-span-2 grid grid-cols-2 gap-2">
          {isInternal ? (
            <>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">IP Interna</p>
                <p className="font-mono text-xs text-violet-400">{sensor.ip}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">IP Externa</p>
                <p className="font-mono text-xs text-foreground">{honeypotPublicIp || "-"}</p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">IP</p>
              <p className="font-mono text-xs text-foreground">{sensor.ip || "-"}</p>
            </div>
          )}
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Events</p>
          <p className="font-semibold text-sm text-foreground">{sensor.eventsTotal.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Last seen</p>
          <p className="text-xs text-foreground">{formatRelative(sensor.lastSeen)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Sensor ID</p>
          <p className="font-mono text-[10px] text-muted-foreground truncate">
            {clientCode ? `${sensor.sensorId}-${clientCode}` : sensor.sensorId}
          </p>
        </div>
      </div>

      {/* Ports */}
      {sensor.ports.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sensor.ports.map((port) => {
            const up = sensor.portStatus?.[port]
            const probeFailedWhileOnline = sensor.online && up === false
            return (
              <span
                key={port}
                title={
                  up === true
                    ? `Puerto ${port} accesible`
                    : probeFailedWhileOnline
                      ? `Puerto ${port} no alcanzable desde el servidor (firewall o NAT)`
                      : up === false
                        ? `Puerto ${port} offline`
                        : `Puerto ${port} — sin datos de probe`
                }
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium cursor-default ${
                  up === true
                    ? "bg-emerald-400/15 text-emerald-400"
                    : probeFailedWhileOnline
                      ? "bg-amber-400/15 text-amber-300"
                      : up === false
                        ? "bg-red-400/15 text-red-400"
                        : "bg-muted/60 text-muted-foreground"
                }`}
              >
                {up === true ? <CheckCircle2 className="h-2.5 w-2.5" />
                  : probeFailedWhileOnline ? <AlertTriangle className="h-2.5 w-2.5" />
                  : up === false ? <XCircle className="h-2.5 w-2.5" />
                  : null}
                :{port}
              </span>
            )
          })}
        </div>
      )}

      {sensor.version && (
        <div className="rounded-md bg-muted/40 px-2.5 py-1">
          <p className="text-[10px] font-mono text-muted-foreground">v{sensor.version}</p>
        </div>
      )}

      {/* Container controls */}
      {hasContainer && (
        <div className="border-t border-border/50 pt-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <ControlButton
              icon={Play}
              label="Iniciar"
              color="text-emerald-400 hover:bg-emerald-400/10"
              disabled={controlState === "loading" || sensor.online}
              onClick={() => handleControl("start")}
            />
            <ControlButton
              icon={Square}
              label="Detener"
              color="text-red-400 hover:bg-red-400/10"
              disabled={controlState === "loading" || !sensor.online}
              onClick={() => handleControl("stop")}
            />
            <ControlButton
              icon={controlState === "loading" ? Loader2 : RotateCcw}
              label="Reiniciar"
              color="text-amber-400 hover:bg-amber-400/10"
              disabled={controlState === "loading"}
              spinning={controlState === "loading"}
              onClick={() => handleControl("restart")}
            />
          </div>
          {controlState !== "idle" && controlState !== "loading" && (
            <span className={`text-[10px] font-medium ${controlState === "ok" ? "text-emerald-400" : "text-red-400"}`}>
              {controlMsg}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function ControlButton({
  icon: Icon,
  label,
  color,
  disabled,
  spinning,
  onClick,
}: {
  icon: React.ElementType
  label: string
  color: string
  disabled?: boolean
  spinning?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`rounded p-1.5 text-muted-foreground/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${color}`}
    >
      <Icon className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`} />
    </button>
  )
}
