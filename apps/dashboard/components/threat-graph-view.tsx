"use client"

import { useCallback, useEffect } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type NodeProps,
  type Node,
  type Edge,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Crosshair,
  Server,
  KeyRound,
  Terminal,
  Bug,
  Radio,
  ShieldAlert,
  Network,
  type LucideIcon,
} from "lucide-react"
import type { ThreatGraph, ThreatNodeData, ThreatNodeKind } from "@/lib/threat-graph"

const KIND_ICON: Record<ThreatNodeKind, LucideIcon> = {
  ip: Crosshair,
  infra: Server,
  protocol: Network,
  credential: KeyRound,
  behavior: Terminal,
  family: Bug,
  ioc: Radio,
  reputation: ShieldAlert,
}

const KIND_ACCENT: Record<ThreatNodeKind, string> = {
  ip: "border-red-500/60 bg-red-500/10 text-red-300",
  infra: "border-slate-500/50 bg-slate-500/10 text-slate-300",
  protocol: "border-cyan-500/50 bg-cyan-500/10 text-cyan-300",
  credential: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  behavior: "border-orange-500/50 bg-orange-500/10 text-orange-300",
  family: "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-300",
  ioc: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  reputation: "border-purple-500/50 bg-purple-500/10 text-purple-300",
}

const FOUR_SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const

function ThreatNode({ data }: NodeProps<Node<ThreatNodeData>>) {
  const Icon = KIND_ICON[data.kind]
  const isCenter = data.kind === "ip"

  return (
    <div
      className={`rounded-lg border px-3 py-2 shadow-sm backdrop-blur-sm ${KIND_ACCENT[data.kind]} ${
        isCenter ? "min-w-[140px]" : "min-w-[110px] max-w-[180px]"
      }`}
      title={data.copyable ?? data.label}
    >
      {/* Handles on all four sides; edges pick the closest pair dynamically.
          Each side carries both a source and a target handle so an edge can
          enter/leave from whichever side gives the shortest, straightest path. */}
      {FOUR_SIDES.map((pos) => (
        <Handle
          key={`t-${pos}`}
          id={`t-${pos}`}
          type="target"
          position={pos}
          className="!h-1 !w-1 !min-w-0 !min-h-0 !border-0 !bg-transparent"
        />
      ))}
      {FOUR_SIDES.map((pos) => (
        <Handle
          key={`s-${pos}`}
          id={`s-${pos}`}
          type="source"
          position={pos}
          className="!h-1 !w-1 !min-w-0 !min-h-0 !border-0 !bg-transparent"
        />
      ))}
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className={`truncate font-mono ${isCenter ? "text-sm font-semibold" : "text-xs"}`}>
          {data.label}
        </span>
      </div>
      {data.sub && <p className="mt-0.5 truncate text-[10px] opacity-70">{data.sub}</p>}
    </div>
  )
}

const nodeTypes = { threatNode: ThreatNode }

// Explicit colors — React Flow draws edges in SVG, where Tailwind CSS vars
// like var(--border) don't resolve. Use concrete values.
const EDGE_COLOR = "#475569"      // slate-600
const EDGE_LABEL = "#94a3b8"      // slate-400
const EDGE_LABEL_BG = "#0f172a"   // slate-900

const NODE_W = 150
const NODE_H = 52

/**
 * Picks which of the four sides an edge should leave/enter by the dominant axis
 * between the two node centers. If the target is mostly to the right, the edge
 * exits the right side and enters the left side — the shortest, straightest
 * path, instead of always going out the bottom and curving back.
 */
function sideHandles(
  src: { x: number; y: number },
  tgt: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const dx = tgt.x - src.x
  const dy = tgt.y - src.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "s-right", targetHandle: "t-left" }
      : { sourceHandle: "s-left", targetHandle: "t-right" }
  }
  return dy >= 0
    ? { sourceHandle: "s-bottom", targetHandle: "t-top" }
    : { sourceHandle: "s-top", targetHandle: "t-bottom" }
}

function center(n: Node | undefined): { x: number; y: number } {
  if (!n) return { x: 0, y: 0 }
  return { x: n.position.x + NODE_W / 2, y: n.position.y + NODE_H / 2 }
}

function toFlowEdges(graph: ThreatGraph, nodes: Node[]): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return graph.edges.map((e) => {
    const { sourceHandle, targetHandle } = sideHandles(
      center(byId.get(e.source)),
      center(byId.get(e.target)),
    )
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle,
      targetHandle,
      label: e.label,
      type: "straight",
      animated: e.source === "ip",
      style: { stroke: EDGE_COLOR, strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 },
      labelStyle: { fill: EDGE_LABEL, fontSize: 10 },
      labelBgStyle: { fill: EDGE_LABEL_BG, fillOpacity: 0.85 },
      labelBgPadding: [4, 2] as [number, number],
    }
  })
}

export function ThreatGraphView({ graph }: { graph: ThreatGraph }) {
  const [nodes, , onNodesChange] = useNodesState<Node<ThreatNodeData>>(
    graph.nodes as Node<ThreatNodeData>[],
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    toFlowEdges(graph, graph.nodes as Node[]),
  )

  // Recompute which side each edge attaches to whenever node positions change
  // (initial render, prop change, or dragging a node) so connections always
  // take the shortest side and stay straight.
  useEffect(() => {
    setEdges(toFlowEdges(graph, nodes))
  }, [graph, nodes, setEdges])

  const onNodeClick = useCallback((_: unknown, node: Node<ThreatNodeData>) => {
    const { href, copyable } = node.data
    if (href) {
      window.open(href, href.startsWith("http") ? "_blank" : "_self")
    } else if (copyable) {
      navigator.clipboard?.writeText(copyable)
    }
  }, [])

  return (
    <div className="h-[560px] w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={16} className="!bg-transparent" color={EDGE_COLOR} />
        <Controls className="!bg-card !border-border" showInteractive={false} />
        <MiniMap
          className="!bg-card !border-border"
          maskColor="rgba(0,0,0,0.4)"
          nodeColor={EDGE_LABEL}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  )
}
