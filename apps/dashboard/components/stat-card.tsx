import type { ElementType } from "react"

interface StatCardProps {
  icon: ElementType
  label: string
  value: string | number
  color?: string
  bg?: string
}

export function StatCard({
  icon: Icon,
  label,
  value,
  color = "text-muted-foreground",
  bg = "bg-secondary",
}: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold text-foreground">{value}</p>
      </div>
    </div>
  )
}
