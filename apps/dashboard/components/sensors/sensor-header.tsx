"use client"

import { Loader2, Trash2, WifiOff } from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { getProtocolMeta } from "@/lib/sensor-display"
import type { Sensor } from "@/lib/api"

function OnlineBadge() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="text-xs font-medium text-emerald-400">Online</span>
    </div>
  )
}

function OfflineBadge() {
  return (
    <div className="flex items-center gap-1.5">
      <WifiOff className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Offline</span>
    </div>
  )
}

const DOCKER_BADGE_CONFIG: Record<string, { dot: string; pulse: boolean; label: string; text: string }> = {
  running:    { dot: "bg-emerald-400", pulse: true,  label: "Iniciado",     text: "text-emerald-400" },
  restarting: { dot: "bg-amber-400",   pulse: true,  label: "Reiniciando",  text: "text-amber-400"   },
  exited:     { dot: "bg-red-500",     pulse: false, label: "Detenido",     text: "text-red-400"     },
  dead:       { dot: "bg-red-500",     pulse: false, label: "Detenido",     text: "text-red-400"     },
  paused:     { dot: "bg-slate-400",   pulse: false, label: "Pausado",      text: "text-slate-400"   },
  not_found:  { dot: "bg-muted-foreground/50", pulse: false, label: "No encontrado", text: "text-muted-foreground" },
}

function DockerStatusBadge({ status }: { status: string }) {
  const cfg = DOCKER_BADGE_CONFIG[status]
  const dot = cfg?.dot ?? "bg-muted-foreground/30"
  const text = cfg?.text ?? "text-muted-foreground"
  const label = cfg?.label ?? status
  const pulse = cfg?.pulse ?? false
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dot} opacity-75`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      <span className={`text-xs font-medium capitalize ${text}`}>{label}</span>
    </div>
  )
}

function DeleteSensorDialog({ sensor, deleting, onDelete }: { sensor: Sensor; deleting: boolean; onDelete: () => void }) {
  return (
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
            <span className="text-muted-foreground">
              Events already collected from this sensor are kept and stay searchable.
            </span>{" "}
            If the sensor is still running it will re-register on the next heartbeat.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-white hover:bg-destructive/90">
            Delete sensor
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function SensorHeader({
  sensor,
  dockerStatus,
  deleting,
  onDelete,
}: {
  sensor: Sensor
  dockerStatus: string | null
  deleting: boolean
  onDelete: () => void
}) {
  const meta = getProtocolMeta(sensor.protocol)
  const Icon = meta.icon
  const hasContainer = !!sensor.probeHost
  return (
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
        {hasContainer && dockerStatus ? <DockerStatusBadge status={dockerStatus} /> : sensor.online ? <OnlineBadge /> : <OfflineBadge />}
        <DeleteSensorDialog sensor={sensor} deleting={deleting} onDelete={onDelete} />
      </div>
    </div>
  )
}
