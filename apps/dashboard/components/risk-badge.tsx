import Link from "next/link"
import type { RiskLevel } from "@/lib/api"

const STYLES: Record<RiskLevel, string> = {
  CRITICAL: "bg-red-500/15 text-red-400 border-red-500/40",
  HIGH:     "bg-orange-500/15 text-orange-400 border-orange-500/40",
  MEDIUM:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
  LOW:      "bg-blue-500/15 text-blue-400 border-blue-500/40",
  INFO:     "bg-muted/40 text-muted-foreground border-border",
}

export function RiskBadge({
  level,
  score,
  ip,
}: {
  level: RiskLevel
  score: number
  ip: string
}) {
  return (
    <Link
      href={`/threats/${encodeURIComponent(ip)}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-80 ${STYLES[level]}`}
    >
      <span>{level}</span>
      <span className="opacity-70">·</span>
      <span className="font-mono">{score}</span>
    </Link>
  )
}
