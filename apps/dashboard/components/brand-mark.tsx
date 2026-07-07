"use client"

import { Bug } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBrand } from "@/lib/use-brand"
import { BRANDS } from "@/lib/brand-config"

/**
 * The icon-box-vs-logo swap for the current instance brand. Shared by the
 * login page and the sidebar header so the branching logic lives in one
 * place.
 *
 * - "mark"  — square icon slot (collapsed sidebar rail, or the default
 *             brand's icon box next to its name/tagline text).
 * - "wide"  — white lockup, no slogan (expanded sidebar header) — replaces
 *             the separate name/tagline text entirely for the corporate
 *             brand, since the image already carries the wordmark.
 * - "full"  — the full lockup with the slogan (login page).
 */
export function BrandMark({ variant = "mark" }: { variant?: "mark" | "wide" | "full" }) {
  const brand = useBrand()

  if (brand === "default") {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center bg-accent",
          variant === "full" ? "h-12 w-12 rounded-xl" : "h-8 w-8 rounded-lg",
        )}
      >
        <Bug className={variant === "full" ? "h-6 w-6 text-accent-foreground" : "h-4 w-4 text-accent-foreground"} />
      </div>
    )
  }

  const info = BRANDS[brand]
  if (variant === "mark") {
    return <img src={info.logoMark} alt={info.name} className="h-8 w-8 shrink-0 object-contain" />
  }
  if (variant === "wide") {
    return <img src={info.logoWide} alt={info.name} className="h-7 w-auto shrink-0" />
  }
  return <img src={info.logoFull} alt={info.name} className="h-14 w-auto" />
}
