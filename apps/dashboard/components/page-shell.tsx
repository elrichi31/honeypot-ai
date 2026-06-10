import { cn } from "@/lib/utils"

/**
 * Page content container. Constrains content to a comfortable max width and
 * centers it so wide screens don't stretch tables/cards edge-to-edge — the calm,
 * focused feel of Notion/Linear. The surrounding <main> already supplies page
 * padding, so this only handles max width + centering.
 *
 * `wide` opts out of the max-width clamp for views that need the full canvas
 * (e.g. the live map / globe / network topology).
 */
export function PageShell({
  children,
  wide = false,
  className,
}: {
  children: React.ReactNode
  wide?: boolean
  className?: string
}) {
  return (
    <div className={cn("mx-auto w-full", wide ? "max-w-none" : "max-w-[1600px]", className)}>
      {children}
    </div>
  )
}
