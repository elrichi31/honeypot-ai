"use client"

import { Loader2, Play, RotateCcw, Square } from "lucide-react"

export type ControlAction = "start" | "stop" | "restart"
export type ControlState = "idle" | "loading" | "ok" | "error"

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
      className={`rounded p-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${color}`}
    >
      <Icon className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`} />
    </button>
  )
}

export function SensorActions({
  controlState,
  controlMsg,
  onControl,
}: {
  controlState: ControlState
  controlMsg: string
  onControl: (action: ControlAction) => void
}) {
  const loading = controlState === "loading"
  return (
    <div className="border-t border-border/50 pt-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <ControlButton
          icon={Play}
          label="Start"
          color="text-emerald-400 hover:bg-emerald-400/15"
          disabled={loading}
          onClick={() => onControl("start")}
        />
        <ControlButton
          icon={Square}
          label="Stop"
          color="text-red-400 hover:bg-red-400/15"
          disabled={loading}
          onClick={() => onControl("stop")}
        />
        <ControlButton
          icon={loading ? Loader2 : RotateCcw}
          label="Restart"
          color="text-amber-400 hover:bg-amber-400/15"
          disabled={loading}
          spinning={loading}
          onClick={() => onControl("restart")}
        />
      </div>
      {controlState !== "idle" && !loading && (
        <span className={`text-[10px] font-medium ${controlState === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {controlMsg}
        </span>
      )}
    </div>
  )
}
