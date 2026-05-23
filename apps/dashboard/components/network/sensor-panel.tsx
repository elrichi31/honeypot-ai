import { WifiOff } from "lucide-react"
import { getMeta } from "./constants"
import type { Sensor } from "@/lib/api"

interface SensorPanelProps {
  sensor: Sensor
  onClose: () => void
}

const ROWS: Array<{ label: string; value: (s: Sensor) => string; mono: boolean }> = [
  { label: "IP",        value: s => s.ip || "-",                                            mono: true  },
  { label: "Sensor ID", value: s => s.sensorId,                                             mono: true  },
  { label: "Events",    value: s => s.eventsTotal.toLocaleString(),                         mono: false },
  { label: "Ports",     value: s => s.ports.length > 0 ? s.ports.map(p => `:${p}`).join(" ") : "-", mono: true },
  { label: "Version",   value: s => s.version || "-",                                       mono: true  },
]

export function SensorPanel({ sensor, onClose }: SensorPanelProps) {
  const meta = getMeta(sensor.protocol)
  const Icon = meta.icon

  return (
    <div
      className="absolute right-3 top-3 bottom-3 w-56 rounded-xl border border-border bg-card/95 backdrop-blur-md p-4 flex flex-col gap-3 shadow-2xl"
      style={{ zIndex: 20 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.bg}`}>
          <Icon className={`h-5 w-5 ${meta.color}`} />
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-sm leading-none mt-1"
        >
          ✕
        </button>
      </div>

      {/* Identity */}
      <div>
        <p className={`text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>{meta.label}</p>
        <p className="text-sm font-semibold text-foreground mt-1 leading-snug">{sensor.name}</p>
        {sensor.clientName && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{sensor.clientName}</p>
        )}
      </div>

      {/* Details */}
      <div className="space-y-2.5 flex-1 overflow-auto">
        {ROWS.map(({ label, value, mono }) => (
          <div key={label}>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60">{label}</p>
            <p className={`text-foreground mt-0.5 truncate ${mono ? "font-mono text-[10px]" : "font-medium text-xs"}`}>
              {value(sensor)}
            </p>
          </div>
        ))}
      </div>

      {/* Status footer */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
        {sensor.online ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-emerald-400 text-xs font-medium">Online</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground text-xs">Offline</span>
          </>
        )}
      </div>
    </div>
  )
}
