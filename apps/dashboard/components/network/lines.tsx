import { CANVAS_W, CANVAS_H, NODE_H } from "./constants"
import { bez } from "./utils"
import type { Layout } from "./types"

interface LinesProps {
  layout: Layout
  selectedId: string | null
}

export function Lines({ layout, selectedId }: LinesProps) {
  const { internet, extNodes, intNodes, clusters } = layout

  // When a sensor is selected, find which client it belongs to so we can dim
  // connections that don't belong to that cluster.
  const selClient = selectedId
    ? (extNodes.find(n => n.sensor.sensorId === selectedId) ??
       intNodes.find(n => n.sensor.sensorId === selectedId))?.clientKey ?? null
    : null

  function opacity(clientKey: string) {
    return !selectedId || clientKey === selClient ? 1 : 0.07
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ zIndex: 1 }}
    >
      <defs>
        <filter id="glow-strong">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-soft">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Internet → external sensors (cyan) */}
      {extNodes.map(n => {
        const p = bez(internet.x, internet.y + 22, n.x, n.y - NODE_H / 2)
        return (
          <g key={n.sensor.sensorId} style={{ opacity: opacity(n.clientKey), transition: "opacity 0.2s" }}>
            <path d={p} fill="none" stroke="rgb(34,211,238)" strokeWidth="1"   strokeDasharray="6 4" strokeOpacity="0.18" />
            <path d={p} fill="none" stroke="rgb(34,211,238)" strokeWidth="2"   strokeOpacity="0.65" filter="url(#glow-strong)" />
          </g>
        )
      })}

      {/* Internet → internal sensors for clusters with no external sensors (violet) */}
      {clusters.map(cl => {
        if (cl.hasInt) return null
        return intNodes
          .filter(n => n.clientKey === cl.key)
          .map(n => {
            const p = bez(internet.x, internet.y + 22, n.x, n.y - NODE_H / 2)
            return (
              <g key={n.sensor.sensorId} style={{ opacity: opacity(n.clientKey), transition: "opacity 0.2s" }}>
                <path d={p} fill="none" stroke="rgb(139,92,246)" strokeWidth="1"   strokeDasharray="6 4" strokeOpacity="0.18" />
                <path d={p} fill="none" stroke="rgb(139,92,246)" strokeWidth="2"   strokeOpacity="0.55" filter="url(#glow-strong)" />
              </g>
            )
          })
      })}

      {/* External → internal (same cluster, violet) */}
      {extNodes.map(en =>
        intNodes
          .filter(n => n.clientKey === en.clientKey)
          .map(n => {
            const p = bez(en.x, en.y + NODE_H / 2, n.x, n.y - NODE_H / 2)
            return (
              <g key={`${en.sensor.sensorId}-${n.sensor.sensorId}`} style={{ opacity: opacity(en.clientKey), transition: "opacity 0.2s" }}>
                <path d={p} fill="none" stroke="rgb(139,92,246)" strokeWidth="0.8" strokeDasharray="5 4" strokeOpacity="0.18" />
                <path d={p} fill="none" stroke="rgb(139,92,246)" strokeWidth="1.5" strokeOpacity="0.45" filter="url(#glow-soft)" />
              </g>
            )
          })
      )}
    </svg>
  )
}
