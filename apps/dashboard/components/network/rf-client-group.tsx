"use client"

import { memo } from "react"

export type ClientGroupData = {
  label: string
  slug: string | null
}

export const RfClientGroup = memo(function RfClientGroup({
  data,
  style,
}: {
  data: ClientGroupData
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{ width: style?.width, height: style?.height }}
      className="rounded-xl border border-border/40 bg-muted/5 backdrop-blur-sm"
    >
      {/* Client label badge at top-left */}
      <div className="absolute left-3 top-2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-border/60" />
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
          {data.label}
        </span>
      </div>
    </div>
  )
})
