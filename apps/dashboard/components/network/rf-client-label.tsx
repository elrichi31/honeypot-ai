"use client"

import { memo } from "react"

export const RfClientLabel = memo(function RfClientLabel({
  data,
}: {
  data: { label: string }
}) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card/80 px-3 py-1 backdrop-blur-sm"
      style={{ transform: "translateX(-50%)", whiteSpace: "nowrap" }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
        {data.label}
      </span>
    </div>
  )
})
