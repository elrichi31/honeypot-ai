import { cn } from "@/lib/utils"

/**
 * Consistent page header: a title, optional subtitle, and an optional actions
 * slot aligned to the right. Reusable so every screen shares the same type
 * hierarchy and spacing instead of hand-rolling its own <h1>. Opt-in — existing
 * pages keep working until migrated.
 */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("mb-6 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon}
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        </div>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
