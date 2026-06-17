import { ATTACK_COLORS, ATTACK_LABELS, ATTACK_LABELS_LONG } from "@/lib/attack-types"

interface AttackTypeBadgeProps {
  type: string
  /** "xs" = 10px text (table chips), "sm" = 12px (default), "base" = header pills */
  size?: "xs" | "sm" | "base"
  /** Use the long label variant (e.g. "SQL Injection" instead of "SQLi") */
  long?: boolean
  className?: string
}

export function AttackTypeBadge({ type, size = "sm", long = false, className }: AttackTypeBadgeProps) {
  const sizeClass = {
    xs:   "px-1.5 py-0.5 text-[10px]",
    sm:   "px-2 py-0.5 text-xs",
    base: "px-2.5 py-1 text-xs",
  }[size]

  const label = long
    ? (ATTACK_LABELS_LONG[type] ?? ATTACK_LABELS[type] ?? type)
    : (ATTACK_LABELS[type] ?? type)

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${sizeClass} ${ATTACK_COLORS[type] ?? ATTACK_COLORS.recon} ${className ?? ""}`}
    >
      {label}
    </span>
  )
}
