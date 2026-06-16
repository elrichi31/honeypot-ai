"use client"

import { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import { Building2 } from "lucide-react"

export type ClientLabelData = {
  label: string
  online: boolean
}

export const RfClientLabel = memo(function RfClientLabel({
  data,
}: {
  data: ClientLabelData
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/90 px-4 py-2.5 backdrop-blur-sm shadow-lg"
      style={{ whiteSpace: "nowrap" }}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <span className="text-xs font-semibold text-foreground">
        {data.label}
      </span>
      <span className={`h-1.5 w-1.5 rounded-full ${data.online ? "bg-emerald-400" : "bg-slate-600"}`} />

      {/* sends to sensors */}
      <Handle type="source" position={Position.Bottom} className="!border-none !bg-transparent" />
    </div>
  )
})
