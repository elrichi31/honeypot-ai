"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { AlertTriangle, RefreshCw, Loader2 } from "lucide-react"

/**
 * Inline error state for a single dashboard section that failed to load (e.g. a
 * backend fetch timed out). Unlike the empty state, it makes clear the data
 * could not be loaded — never a misleading "no data". The retry button
 * re-renders the server component so the section recovers without a full reload.
 */
export function SectionError({
  title = "Could not load this section",
  message = "The server took too long or did not respond. This is usually temporary.",
}: {
  title?: string
  message?: string
}) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)

  function retry() {
    setRetrying(true)
    router.refresh()
    // router.refresh() resolves once the server component re-renders; reset the
    // spinner shortly after so it doesn't spin forever if data is unchanged.
    setTimeout(() => setRetrying(false), 2000)
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/10">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      <button
        onClick={retry}
        disabled={retrying}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Retry
      </button>
    </div>
  )
}
