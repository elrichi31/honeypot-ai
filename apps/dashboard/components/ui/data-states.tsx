"use client"

import { AlertTriangle, RefreshCw, SearchX, ShieldOff, Globe, Activity } from "lucide-react"

const icons = {
  default:   SearchX,
  error:     AlertTriangle,
  shield:    ShieldOff,
  globe:     Globe,
  activity:  Activity,
} as const

type IconKey = keyof typeof icons

interface EmptyStateProps {
  title: string
  description?: string
  icon?: IconKey
}

export function EmptyState({ title, description, icon = "default" }: EmptyStateProps) {
  const Icon = icons[icon]
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
        <Icon className="h-5 w-5 text-muted-foreground/60" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  description?: string
}

export function ErrorState({
  title = "Could not load data",
  description = "There was a problem connecting to the API.",
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-5 w-5 text-destructive" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="mt-1 flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        <RefreshCw className="h-3 w-3" />
        Retry
      </button>
    </div>
  )
}
