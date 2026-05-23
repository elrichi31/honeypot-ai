import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react"

interface ZoomControlsProps {
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

export function ZoomControls({ scale, onZoomIn, onZoomOut, onFit }: ZoomControlsProps) {
  return (
    <div className="absolute bottom-4 right-4 flex flex-col items-center gap-1 z-30">
      <button
        onClick={onZoomIn}
        title="Zoom in"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors"
      >
        <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <button
        onClick={onZoomOut}
        title="Zoom out"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors"
      >
        <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <button
        onClick={onFit}
        title="Fit view"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors"
      >
        <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <p className="mt-1 text-[9px] text-muted-foreground/50 font-mono tabular-nums">
        {Math.round(scale * 100)}%
      </p>
    </div>
  )
}
