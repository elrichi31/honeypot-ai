"use client"

import { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import { Globe } from "lucide-react"

export const RfInternetNode = memo(function RfInternetNode() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-cyan-400/30 bg-card/90 backdrop-blur-sm px-6 py-3 shadow-[0_0_40px_rgb(34,211,238,0.18)]">
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-400/10">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/8" />
        <Globe className="h-4 w-4 text-cyan-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground leading-none">Internet</p>
        <p className="text-[10px] text-cyan-400/70 mt-0.5">External attack surface</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!border-none !bg-transparent" />
    </div>
  )
})
