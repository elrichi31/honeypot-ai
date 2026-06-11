"use client"

import { Loader2, Trash2, WifiOff } from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { getProtocolMeta } from "@/lib/sensor-display"
import type { Sensor } from "@/lib/api"
import { useT } from "@/components/locale-provider"
import type { TranslationKey } from "@/lib/i18n/dictionaries"

function OnlineBadge() {
  const t = useT()
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="text-xs font-medium text-emerald-400">{t("sensors.badge.online")}</span>
    </div>
  )
}

function OfflineBadge() {
  const t = useT()
  return (
    <div className="flex items-center gap-1.5">
      <WifiOff className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{t("sensors.badge.offline")}</span>
    </div>
  )
}

const DOCKER_BADGE_CONFIG: Record<string, { dot: string; pulse: boolean; labelKey: TranslationKey; text: string }> = {
  running:    { dot: "bg-emerald-400", pulse: true,  labelKey: "sensors.badge.running",    text: "text-emerald-400" },
  restarting: { dot: "bg-amber-400",   pulse: true,  labelKey: "sensors.badge.restarting", text: "text-amber-400"   },
  exited:     { dot: "bg-red-500",     pulse: false, labelKey: "sensors.badge.stopped",    text: "text-red-400"     },
  dead:       { dot: "bg-red-500",     pulse: false, labelKey: "sensors.badge.stopped",    text: "text-red-400"     },
  paused:     { dot: "bg-slate-400",   pulse: false, labelKey: "sensors.badge.paused",     text: "text-slate-400"   },
  not_found:  { dot: "bg-muted-foreground/50", pulse: false, labelKey: "sensors.badge.notFound", text: "text-muted-foreground" },
}

function DockerStatusBadge({ status }: { status: string }) {
  const t = useT()
  const cfg = DOCKER_BADGE_CONFIG[status]
  const dot = cfg?.dot ?? "bg-muted-foreground/30"
  const text = cfg?.text ?? "text-muted-foreground"
  const label = cfg ? t(cfg.labelKey) : status
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
  const t = useT()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          className="rounded p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
          title={t("sensors.delete.button")}
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("sensors.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("sensors.delete.descPrefix")}<span className="font-medium text-foreground">{sensor.name}</span>{" "}
            (<code className="font-mono text-xs">{sensor.sensorId}</code>).
            <br /><br />
            <span className="text-muted-foreground">
              {t("sensors.delete.descKept")}
            </span>
            {t("sensors.delete.descReregister")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("sensors.delete.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-white hover:bg-destructive/90">
            {t("sensors.delete.button")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RemoteBadge({ online }: { online: boolean }) {
  const t = useT()
  if (online) {
    return (
      <div className="flex items-center gap-1.5" title={t("sensors.remote.activeTitle")}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-xs font-medium text-emerald-400">{t("sensors.badge.remoteActive")}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5" title={t("sensors.remote.noSignalTitle")}>
      <span className="relative inline-flex h-2 w-2 rounded-full bg-muted-foreground/50" />
      <span className="text-xs font-medium text-muted-foreground">{t("sensors.badge.remoteNoSignal")}</span>
    </div>
  )
}

export function SensorHeader({
  sensor,
  dockerStatus,
  isRemote,
  deleting,
  onDelete,
}: {
  sensor: Sensor
  dockerStatus: string | null
  isRemote: boolean
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
        {isRemote ? <RemoteBadge online={sensor.online} /> : hasContainer && dockerStatus ? <DockerStatusBadge status={dockerStatus} /> : sensor.online ? <OnlineBadge /> : <OfflineBadge />}
        <DeleteSensorDialog sensor={sensor} deleting={deleting} onDelete={onDelete} />
      </div>
    </div>
  )
}
