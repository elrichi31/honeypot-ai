"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { PageShell } from "@/components/page-shell"

/**
 * Global error boundary. When a server component throws — e.g. a backend fetch
 * times out while the API is saturated — Next.js renders this instead of a dead
 * page. The "Try again" button re-runs the failed render, so the user recovers
 * with one click once the backend catches up, no full reload needed.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Route render error:", error)
  }, [error])

  return (
    <PageShell>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">No se pudo cargar la vista</h2>
            <p className="text-sm text-muted-foreground">
              El servidor tardó demasiado o no respondió. Suele ser temporal —
              vuelve a intentarlo en unos segundos.
            </p>
          </div>
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      </div>
    </PageShell>
  )
}
