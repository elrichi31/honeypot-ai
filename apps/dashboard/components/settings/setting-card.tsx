"use client"

import { Button } from "@/components/ui/button"
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react"

export type SaveStatus = "idle" | "loading" | "saving" | "saved" | "error"

export function Skeleton() {
  return <div className="h-10 w-full animate-pulse rounded-md bg-secondary" />
}

export function SaveFeedback({ status, error }: { status: SaveStatus; error: string }) {
  if (status === "error")
    return (
      <p className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" /> {error}
      </p>
    )
  if (status === "saved")
    return (
      <p className="flex items-center gap-1 text-xs text-success">
        <CheckCircle className="h-3 w-3" /> Guardado correctamente.
      </p>
    )
  return null
}

export function SaveButton({ status, loading }: { status: SaveStatus; loading: boolean }) {
  return (
    <Button
      type="submit"
      disabled={status === "saving" || loading}
      className="bg-primary text-primary-foreground hover:bg-primary/90"
    >
      {status === "saving" ? (
        <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Guardando</>
      ) : status === "saved" ? (
        <><CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Guardado</>
      ) : (
        "Guardar"
      )}
    </Button>
  )
}

export function CardHeader({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  badge,
}: {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  title: string
  description: string
  badge?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border p-4">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {badge}
    </div>
  )
}
