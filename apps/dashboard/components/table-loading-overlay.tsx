"use client"

import { Spinner } from "@/components/ui/spinner"
import { useNavTransitionOptional } from "@/lib/use-nav-transition"

/**
 * Semi-transparent overlay shown over a table/panel while a navigation
 * (tab switch, filter, pagination) is loading new server data.
 *
 * Controlled directly via the `show` prop.
 */
export function TableLoadingOverlay({ show, label = "Loading…" }: { show: boolean; label?: string }) {
  if (!show) return null

  return (
    <div
      // pointer-events-auto + onWheel/onTouchMove blocking makes the overlay
      // swallow scroll and clicks over the panel while data is loading, so the
      // table underneath can't be scrolled out from under the spinner.
      className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-[1px] transition-opacity"
      onWheel={(e) => e.preventDefault()}
      onTouchMove={(e) => e.preventDefault()}
      aria-busy="true"
      role="status"
    >
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm">
        <Spinner className="size-4 text-primary" />
        {label}
      </div>
    </div>
  )
}

/**
 * Overlay wired to the nav-transition context. Renders nothing on the server
 * and until a navigation is pending, so it can sit inside a Server Component
 * (e.g. TableShell) without affecting SSR/hydration of the table markup.
 */
export function NavLoadingOverlay({ label }: { label?: string }) {
  const { isPending } = useNavTransitionOptional()
  return <TableLoadingOverlay show={isPending} label={label} />
}
