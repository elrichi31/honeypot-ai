import { Loader2 } from "lucide-react"

/**
 * Suspense fallback for a dashboard section: a card-shaped skeleton with a
 * centered spinner + label, so the user sees both the layout taking shape and a
 * clear "loading" signal while the section's data streams in.
 */
export function SectionLoading({
  height = "h-[500px]",
  label = "Loading…",
}: {
  height?: string
  label?: string
}) {
  return (
    <div
      className={`${height} flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card`}
      role="status"
      aria-busy="true"
    >
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
