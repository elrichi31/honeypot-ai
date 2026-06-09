"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import type { Sensor } from "@/lib/api"

import { Lines }          from "./lines"
import { SensorNodeCard } from "./sensor-node"
import { InternetNode }   from "./internet-node"
import { ClusterLayer }   from "./cluster-layer"
import { SensorPanel }    from "./sensor-panel"
import { StatsBar }       from "./stats-bar"
import { ZoomControls }   from "./zoom-controls"
import { useCanvasTransform } from "./use-canvas-transform"
import { buildGroups, computeLayout } from "./utils"
import { CANVAS_W, CANVAS_H } from "./constants"

interface TopologyCanvasProps {
  sensors: Sensor[]
}

export function TopologyCanvas({ sensors }: TopologyCanvasProps) {
  const groups = useMemo(() => buildGroups(sensors), [sensors])
  const layout = useMemo(() => computeLayout(groups), [groups])

  const viewportRef = useRef<HTMLDivElement>(null)
  const [vpW, setVpW] = useState(0)
  const [vpH, setVpH] = useState(600)

  const { xform, fit, zoom, panHandlers, getDidPan } = useCanvasTransform(viewportRef)

  // Measure viewport and set initial fit transform
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const apply = (w: number, h: number) => {
      setVpW(w)
      setVpH(h)
      fit(w, h)
    }

    apply(el.clientWidth, el.clientHeight)

    const obs = new ResizeObserver(([entry]) => {
      apply(entry.contentRect.width, entry.contentRect.height)
    })
    obs.observe(el)
    return () => obs.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Selection state ─────────────────────────────────────────────────────────
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [selectedClient, setSelectedClient] = useState<string | null>(null)

  const allNodes    = [...layout.extNodes, ...layout.intNodes]
  const selectedSensor = selectedId
    ? allNodes.find(n => n.sensor.sensorId === selectedId)?.sensor ?? null
    : null

  function handleNodeClick(sensorId: string, clientKey: string) {
    if (getDidPan()) return
    setSelectedId(prev => prev === sensorId ? null : sensorId)
    setSelectedClient(clientKey)
  }

  function handleClientSelect(key: string) {
    setSelectedClient(prev => prev === key ? null : key)
    setSelectedId(null)
  }

  function handleBackgroundClick() {
    if (!getDidPan()) {
      setSelectedId(null)
      setSelectedClient(null)
    }
  }

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      <StatsBar groups={groups} />

      {/* Scrollable viewport */}
      <div
        ref={viewportRef}
        className="relative flex-1 overflow-hidden"
        style={{
          minHeight: 580,
          cursor: "grab",
          background: `
            radial-gradient(ellipse 70% 35% at 50% 0%, rgb(34 211 238 / 0.05) 0%, transparent 65%),
            radial-gradient(circle, hsl(var(--border) / 0.6) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 28px 28px",
        }}
        onClick={handleBackgroundClick}
        {...panHandlers}
      >
        {/* Transformable world — everything inside scales + pans together */}
        <div
          style={{
            position: "absolute",
            top: 0, left: 0,
            width: CANVAS_W,
            height: CANVAS_H,
            transformOrigin: "0 0",
            transform: `translate(${xform.x.toFixed(2)}px, ${xform.y.toFixed(2)}px) scale(${xform.scale})`,
            willChange: "transform",
          }}
        >
          <Lines         layout={layout}    selectedId={selectedId} />
          <ClusterLayer  clusters={layout.clusters} selectedClient={selectedClient} onSelect={handleClientSelect} />
          <InternetNode  x={layout.internet.x} y={layout.internet.y} />

          {layout.extNodes.map(n => (
            <SensorNodeCard
              key={n.sensor.sensorId}
              node={n}
              selected={selectedId === n.sensor.sensorId}
              onClick={() => handleNodeClick(n.sensor.sensorId, n.clientKey)}
            />
          ))}

          {layout.intNodes.map(n => (
            <SensorNodeCard
              key={n.sensor.sensorId}
              node={n}
              selected={selectedId === n.sensor.sensorId}
              onClick={() => handleNodeClick(n.sensor.sensorId, n.clientKey)}
            />
          ))}
        </div>

        {/* Sensor detail panel — in screen-space, not scaled */}
        {selectedSensor && (
          <SensorPanel
            sensor={selectedSensor}
            onClose={() => { setSelectedId(null); setSelectedClient(null) }}
          />
        )}

        {/* Zoom controls */}
        <ZoomControls
          scale={xform.scale}
          onZoomIn={() => zoom(1.25)}
          onZoomOut={() => zoom(0.8)}
          onFit={() => fit(vpW, vpH)}
        />

        {/* Legend */}
        <div className="absolute bottom-4 left-4 flex items-center gap-4 text-[9px] text-muted-foreground/55 select-none z-10 pointer-events-none">
          <span className="flex items-center gap-1.5">
            <svg width="20" height="8">
              <line x1="0" y1="4" x2="20" y2="4" stroke="rgb(34,211,238)" strokeWidth="1.5" strokeDasharray="5 3" />
            </svg>
            Internet
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="20" height="8">
              <line x1="0" y1="4" x2="20" y2="4" stroke="rgb(139,92,246)" strokeWidth="1.5" strokeDasharray="5 3" />
            </svg>
            Interna
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Online
          </span>
          <span className="text-muted-foreground/35">Scroll → zoom · Drag → pan</span>
        </div>
      </div>
    </div>
  )
}
