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
import { RfClientGroup } from "./rf-client-group"
import { SensorPanel } from "./sensor-panel"
import { StatsBar } from "./stats-bar"
import { buildGroups } from "./utils"

// ─── Layout constants ────────────────────────────────────────────────────────
const NODE_W      = 118
const NODE_H      = 110
const COL_STEP    = NODE_W + 28   // horizontal spacing between sensor columns
const GROUP_PAD_X = 20            // padding inside client group box
const GROUP_PAD_Y = 36            // top padding (room for label)
const GROUP_GAP   = 48            // gap between client groups
const EXT_Y       = 0             // y of external sensors inside group (relative)
const INT_Y       = NODE_H + 60   // y of internal sensors inside group (relative)
const INET_Y      = -200          // internet node — above all groups

const nodeTypes: NodeTypes = {
  internet:    RfInternetNode,
  sensor:      RfSensorNode,
  clientGroup: RfClientGroup,
}

// ─── Edge helpers ─────────────────────────────────────────────────────────────
function cyanEdge(id: string, source: string, target: string): Edge {
  return {
    id, source, target,
    type: "smoothstep",
    animated: true,
    style: { stroke: "rgb(34,211,238)", strokeWidth: 1.5, strokeDasharray: "6 4" },
  }
}

function violetEdge(id: string, source: string, target: string): Edge {
  return {
    id, source, target,
    type: "smoothstep",
    animated: true,
    style: { stroke: "rgb(139,92,246)", strokeWidth: 1.5, strokeDasharray: "6 4" },
  }
}

// ─── Build graph ─────────────────────────────────────────────────────────────
function buildGraph(sensors: Sensor[]): { nodes: Node[]; edges: Edge[] } {
  const groups = buildGroups(sensors)
  const nodes: Node[] = []
  const edges: Edge[] = []

  let cursorX = 0

  for (const group of groups) {
    const extCount  = Math.max(group.external.length, 0)
    const intCount  = group.internal.length
    const colCount  = Math.max(extCount, intCount, 1)
    const innerW    = colCount * COL_STEP - (COL_STEP - NODE_W)
    const groupW    = innerW + GROUP_PAD_X * 2
    const hasInt    = intCount > 0
    const groupH    = GROUP_PAD_Y + NODE_H + (hasInt ? 60 + NODE_H : 0) + GROUP_PAD_X

    // Client group background node
    const groupId = `group-${group.key}`
    nodes.push({
      id:       groupId,
      type:     "clientGroup",
      position: { x: cursorX, y: 0 },
      data:     { label: group.name, slug: group.slug },
      style:    { width: groupW, height: groupH },
      draggable: false,
      selectable: false,
    })

    // External sensors (positioned relative to the group node)
    group.external.forEach((s, i) => {
      nodes.push({
        id:       s.sensorId,
        type:     "sensor",
        parentId: groupId,
        extent:   "parent",
        position: { x: GROUP_PAD_X + i * COL_STEP, y: GROUP_PAD_Y },
        data:     { sensor: s, selected: false, zone: "external" } satisfies SensorNodeData,
        draggable: false,
      })
      edges.push(cyanEdge(`inet-${s.sensorId}`, "__internet__", s.sensorId))
    })

    // Internal sensors
    group.internal.forEach((s, i) => {
      const intStartX = GROUP_PAD_X + (innerW - (intCount * COL_STEP - (COL_STEP - NODE_W))) / 2
      nodes.push({
        id:       s.sensorId,
        type:     "sensor",
        parentId: groupId,
        extent:   "parent",
        position: { x: intStartX + i * COL_STEP, y: GROUP_PAD_Y + INT_Y },
        data:     { sensor: s, selected: false, zone: "internal" } satisfies SensorNodeData,
        draggable: false,
      })

      if (group.external.length > 0) {
        group.external.forEach(ext => {
          edges.push(violetEdge(`${ext.sensorId}-${s.sensorId}`, ext.sensorId, s.sensorId))
        })
      } else {
        edges.push(violetEdge(`inet-int-${s.sensorId}`, "__internet__", s.sensorId))
      }
    })

    cursorX += groupW + GROUP_GAP
  }

  // Total width of all groups — centre internet node above them
  const totalW = cursorX - GROUP_GAP
  nodes.push({
    id:        "__internet__",
    type:      "internet",
    position:  { x: totalW / 2 - 105, y: INET_Y },
    data:      {},
    draggable: false,
    selectable: false,
  })

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
      const isThis = d.sensor.sensorId === data.sensor.sensorId
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
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.1}
          maxZoom={3}
          style={{ width: "100%", height: "100%", background: "transparent" }}
          proOptions={{ hideAttribution: true }}
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
              if (n.type === "clientGroup") return "hsl(var(--muted))"
              const d = n.data as SensorNodeData
              return d?.sensor?.online ? "rgb(52,211,153)" : "rgb(100,116,139)"
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
