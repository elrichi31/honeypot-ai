import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * The standard card surface used across the app: `rounded-xl border bg-card`.
 * Replaces the ~170 hand-written copies of that class string so spacing, border
 * and radius stay consistent and can be tuned in one place.
 *
 * Variants:
 *  - default: solid bordered card.
 *  - muted:   slightly inset background (for nested/secondary panels).
 *  - dashed:  dashed border (empty states / drop zones).
 *
 * `padded` adds the common p-4 inset; omit it when the content manages its own
 * padding (e.g. a table that spans edge-to-edge, or a custom header row).
 */
const variantClasses = {
  default: "border-border bg-card",
  muted: "border-border bg-muted/30",
  dashed: "border-dashed border-border bg-card/40",
} as const

export function Surface({
  variant = "default",
  padded = false,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: keyof typeof variantClasses
  padded?: boolean
}) {
  return (
    <div
      data-slot="surface"
      className={cn(
        "rounded-xl border",
        variantClasses[variant],
        padded && "p-4",
        className,
      )}
      {...props}
    />
  )
}
