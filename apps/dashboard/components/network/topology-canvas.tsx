"use client"

import "@xyflow/react/dist/style.css"

import { useState, useMemo, useCallback } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react"
import type { Sensor } from "@/lib/api"

import { RfSensorNode, type SensorNodeData } from "./rf-sensor-node"
import { RfClientLabel }               from "./rf-client-label"
import { SensorPanel }                 from "./sensor-panel"
import { StatsBar }                    from "./stats-bar"
import { buildGroups }                 from "./utils"
import { useT }                        from "@/components/locale-provider"

// ─── Layout constants ─────────────────────────────────────────────────────────
const NODE_W      = 118
const NODE_H      = 110
const COL_STEP    = NODE_W + 32   // column pitch
const GROUP_GAP   = 100           // horizontal gap between client groups
const CLIENT_Y    = 40            // Client node y
const SENSOR_Y    = 380           // Sensor row y

const nodeTypes: NodeTypes = {
  sensor:      RfSensorNode,
  clientLabel: RfClientLabel,
}

// ─── Edge colour based on sensor online status ───────────────────────────────
function sensorEdge(
  id: string,
  source: string,
  target: string,
  online: boolean,
  color: string,
): Edge {
  const stroke = online ? color : "rgb(71,85,105)"   // slate-600 when offline
  return {
    id, source, target,
    type: "default",   // bezier — natural curves, not right-angle steps
    animated: online,
    style: { stroke, strokeWidth: 1.5, strokeDasharray: online ? "6 4" : "4 4", strokeOpacity: online ? 1 : 0.45 },
  }
}

// ─── Build graph ──────────────────────────────────────────────────────────────
function buildGraph(sensors: Sensor[]): { nodes: Node[]; edges: Edge[] } {
  const groups = buildGroups(sensors)
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Pass 1 — compute x width for each group and their start positions
  const groupMeta: Array<{ startX: number; groupW: number }> = []
  let cursor = 0
  for (const group of groups) {
    const allCount = group.external.length + group.internal.length
    const cols     = Math.max(allCount, 1)
    const groupW   = cols * COL_STEP - (COL_STEP - NODE_W)
    groupMeta.push({ startX: cursor, groupW })
    cursor += groupW + GROUP_GAP
  }
  const totalW = cursor - GROUP_GAP

  // (Internet node removed — topology starts at client level)

  // Pass 2 — one client node per group + its sensors below
  for (let gi = 0; gi < groups.length; gi++) {
    const group   = groups[gi]
    const { startX, groupW } = groupMeta[gi]
    const clientId = `client-${group.key}`

    // Is any sensor in this group online?
    const anyOnline = [...group.external, ...group.internal].some(s => s.online)

    // Client node — centred in its column
    nodes.push({
      id:        clientId,
      type:      "clientLabel",
      position:  { x: startX + groupW / 2, y: CLIENT_Y },
      data:      { label: group.name, groupKey: group.key, online: anyOnline },
      draggable: true,
      zIndex: 15,
    })

    // All sensors (ext + int) laid out in a single row below the client node
    const allSensors = [...group.external, ...group.internal]
    const rowW       = allSensors.length * COL_STEP - (COL_STEP - NODE_W)
    const rowStartX  = startX + (groupW - rowW) / 2

    allSensors.forEach((s, i) => {
      nodes.push({
        id:       s.sensorId,
        type:     "sensor",
        position: { x: rowStartX + i * COL_STEP, y: SENSOR_Y },
        data:     { sensor: s, selected: false, zone: "external" } satisfies SensorNodeData,
        draggable: true,
        zIndex: 20,
      })
      // Client → Sensor
      edges.push(sensorEdge(`${clientId}-${s.sensorId}`, clientId, s.sensorId, s.online, "rgb(139,92,246)"))
    })
  }

  return { nodes, edges }
}

// ─── Component ────────────────────────────────────────────────────────────────
export function TopologyCanvas({ sensors }: { sensors: Sensor[] }) {
  const groups = useMemo(() => buildGroups(sensors), [sensors])
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => buildGraph(sensors), [sensors])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, ,  onEdgesChange]        = useEdgesState(initialEdges)
  const [selectedSensor, setSelectedSensor] = useState<Sensor | null>(null)

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== "sensor") return
    const data = node.data as SensorNodeData
    setSelectedSensor(prev =>
      prev?.sensorId === data.sensor.sensorId ? null : data.sensor
    )
    setNodes(ns => ns.map(n => {
      if (n.type !== "sensor") return n
      const d = n.data as SensorNodeData
      const isThis    = d.sensor.sensorId === data.sensor.sensorId
      const wasSelected = selectedSensor?.sensorId === data.sensor.sensorId
      return { ...n, data: { ...d, selected: isThis && !wasSelected } }
    }))
  }, [selectedSensor, setNodes])

  const onPaneClick = useCallback(() => {
    setSelectedSensor(null)
    setNodes(ns => ns.map(n => {
      if (n.type !== "sensor") return n
      return { ...n, data: { ...(n.data as SensorNodeData), selected: false } }
    }))
  }, [setNodes])

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <StatsBar groups={groups} />

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.1}
          maxZoom={3}
          style={{ width: "100%", height: "100%", background: "transparent" }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1}
            color="hsl(var(--border) / 0.5)"
          />
          <Controls
            className="!border-border !bg-card [&_button]:!border-border [&_button]:!bg-card [&_button]:!fill-muted-foreground [&_button:hover]:!bg-muted"
            showInteractive={false}
          />
          <MiniMap
            className="!border-border !bg-card/80"
            nodeColor={n => {
              if (n.id === "__internet__") return "rgb(34,211,238)"
              if (n.type === "clientLabel") return "transparent"
              const d = n.data as SensorNodeData
              return d?.sensor?.online ? "rgb(52,211,153)" : "rgb(71,85,105)"
            }}
            maskColor="hsl(var(--background) / 0.6)"
          />
        </ReactFlow>

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-4 left-[calc(1rem+68px)] z-10 flex select-none items-center gap-4 text-[9px] text-muted-foreground/55">
          <span className="flex items-center gap-1.5">
            <svg width="20" height="8">
              <line x1="0" y1="4" x2="20" y2="4" stroke="rgb(139,92,246)" strokeWidth="1.5" strokeDasharray="5 3" />
            </svg>
            Cliente → Sensor
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="20" height="8">
              <line x1="0" y1="4" x2="20" y2="4" stroke="rgb(71,85,105)" strokeWidth="1.5" strokeDasharray="4 4" strokeOpacity="0.5" />
            </svg>
            Offline
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Online
          </span>
        </div>

        {/* Sensor detail panel */}
        {selectedSensor && (
          <SensorPanel
            sensor={selectedSensor}
            onClose={() => {
              setSelectedSensor(null)
              setNodes(ns => ns.map(n => {
                if (n.type !== "sensor") return n
                return { ...n, data: { ...(n.data as SensorNodeData), selected: false } }
              }))
            }}
          />
        )}
      </div>
    </div>
  )
}
