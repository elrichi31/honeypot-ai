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

import { RfInternetNode } from "./rf-internet-node"
import { RfSensorNode, type SensorNodeData } from "./rf-sensor-node"
import { SensorPanel } from "./sensor-panel"
import { StatsBar } from "./stats-bar"
import { buildGroups } from "./utils"

// ─── Constants ──────────────────────────────────────────────────────────────
const NODE_W = 118
const COL_GAP = 30
const COL_STEP = NODE_W + COL_GAP
const GROUP_GAP = 80
const EXT_Y = 220
const INT_Y = 420
const INET_Y = 60

const nodeTypes: NodeTypes = {
  internet: RfInternetNode,
  sensor: RfSensorNode,
}

// ─── Edge styling helpers ────────────────────────────────────────────────────
function cyanEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    type: "smoothstep",
    animated: true,
    style: { stroke: "rgb(34,211,238)", strokeWidth: 1.5, strokeDasharray: "6 4" },
  }
}

function violetEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    type: "smoothstep",
    animated: true,
    style: { stroke: "rgb(139,92,246)", strokeWidth: 1.5, strokeDasharray: "6 4" },
  }
}

// ─── Build RF nodes + edges from sensor list ─────────────────────────────────
function buildGraph(sensors: Sensor[]): { nodes: Node[]; edges: Edge[] } {
  const groups = buildGroups(sensors)
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Internet node
  nodes.push({
    id: "__internet__",
    type: "internet",
    position: { x: 0, y: INET_Y },
    data: {},
    draggable: false,
    selectable: false,
  })

  // Lay out each client group left-to-right
  let cursorX = 0

  for (const group of groups) {
    const extCount = Math.max(group.external.length, 1)
    const groupW = extCount * COL_STEP - COL_GAP

    // External sensors
    group.external.forEach((s, i) => {
      const x = cursorX + i * COL_STEP
      nodes.push({
        id: s.sensorId,
        type: "sensor",
        position: { x, y: EXT_Y },
        data: { sensor: s, selected: false, zone: "external" } satisfies SensorNodeData,
        draggable: true,
      })
      // Internet → external (cyan)
      edges.push(cyanEdge(`inet-${s.sensorId}`, "__internet__", s.sensorId))
    })

    // Internal sensors — centered under the group
    const intCount = group.internal.length
    const intW = intCount * COL_STEP - COL_GAP
    const intStartX = cursorX + (groupW - intW) / 2

    group.internal.forEach((s, i) => {
      const x = intStartX + i * COL_STEP
      nodes.push({
        id: s.sensorId,
        type: "sensor",
        position: { x, y: INT_Y },
        data: { sensor: s, selected: false, zone: "internal" } satisfies SensorNodeData,
        draggable: true,
      })

      if (group.external.length > 0) {
        // Connect each external sensor in the same group to this internal sensor
        group.external.forEach(ext => {
          edges.push(violetEdge(`${ext.sensorId}-${s.sensorId}`, ext.sensorId, s.sensorId))
        })
      } else {
        // No external sensors: connect Internet → internal (violet)
        edges.push(violetEdge(`inet-int-${s.sensorId}`, "__internet__", s.sensorId))
      }
    })

    cursorX += groupW + GROUP_GAP
  }

  // Centre the internet node horizontally above all sensors
  const totalW = cursorX - GROUP_GAP
  const internetNode = nodes.find(n => n.id === "__internet__")!
  internetNode.position.x = totalW / 2 - 105 // 210px wide / 2

  return { nodes, edges }
}

// ─── Component ───────────────────────────────────────────────────────────────
interface TopologyCanvasProps {
  sensors: Sensor[]
}

export function TopologyCanvas({ sensors }: TopologyCanvasProps) {
  const groups = useMemo(() => buildGroups(sensors), [sensors])
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => buildGraph(sensors), [sensors])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)
  const [selectedSensor, setSelectedSensor] = useState<Sensor | null>(null)

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === "__internet__") return
    const data = node.data as SensorNodeData
    setSelectedSensor(prev =>
      prev?.sensorId === data.sensor.sensorId ? null : data.sensor
    )
    // Highlight the selected node
    setNodes(ns =>
      ns.map(n => {
        if (n.type !== "sensor") return n
        const d = n.data as SensorNodeData
        return {
          ...n,
          data: {
            ...d,
            selected: d.sensor.sensorId === data.sensor.sensorId &&
                      selectedSensor?.sensorId !== data.sensor.sensorId,
          },
        }
      })
    )
  }, [selectedSensor, setNodes])

  const onPaneClick = useCallback(() => {
    setSelectedSensor(null)
    setNodes(ns =>
      ns.map(n => {
        if (n.type !== "sensor") return n
        return { ...n, data: { ...(n.data as SensorNodeData), selected: false } }
      })
    )
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
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={3}
          style={{
            background: "transparent",
            width: "100%",
            height: "100%",
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1}
            color="hsl(var(--border) / 0.6)"
          />
          <Controls
            className="!border-border !bg-card !text-foreground [&_button]:!border-border [&_button]:!bg-card [&_button]:!fill-muted-foreground [&_button:hover]:!bg-muted"
            showInteractive={false}
          />
          <MiniMap
            className="!border-border !bg-card/80"
            nodeColor={(n) => {
              if (n.id === "__internet__") return "rgb(34,211,238)"
              const d = n.data as SensorNodeData
              return d.sensor.online ? "rgb(52,211,153)" : "rgb(100,116,139)"
            }}
            maskColor="hsl(var(--background) / 0.6)"
          />
        </ReactFlow>

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-4 left-[calc(1rem+68px)] z-10 flex select-none items-center gap-4 text-[9px] text-muted-foreground/55">
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
            Internal
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
              setNodes(ns =>
                ns.map(n => {
                  if (n.type !== "sensor") return n
                  return { ...n, data: { ...(n.data as SensorNodeData), selected: false } }
                })
              )
            }}
          />
        )}
      </div>
    </div>
  )
}
