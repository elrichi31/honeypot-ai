"use client"

import { useCallback, useEffect } from "react"
import { useT } from "@/components/locale-provider"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
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

const SEVERITY_RING: Record<"malicious" | "warn", string> = {
  malicious: "ring-2 ring-red-500/70 border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.35)]",
  warn: "ring-1 ring-amber-500/60 border-amber-500/70",
}

function ThreatNode({ data }: NodeProps<Node<ThreatNodeData>>) {
  const t = useT()
  const Icon = KIND_ICON[data.kind]
  const isCenter = data.kind === "ip"
  const severityClass = data.severity ? SEVERITY_RING[data.severity] : ""

  return (
    <div
      className={`rounded-lg border px-3 py-2 shadow-sm backdrop-blur-sm ${KIND_ACCENT[data.kind]} ${severityClass} ${
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
          {data.labelKey ? t(data.labelKey) : data.label}
        </span>
        {data.severity && (
          <span
            className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${data.severity === "malicious" ? "bg-red-500" : "bg-amber-500"}`}
            title={data.severity === "malicious" ? "Flagged malicious by threat intel" : "Suspicious per threat intel"}
          />
        )}
      </div>
      {data.sub && <p className="mt-0.5 truncate text-[10px] opacity-70">{data.sub}</p>}
    </div>
  )
}

const nodeTypes = { threatNode: ThreatNode }

// Explicit colors — React Flow draws edges in SVG, where Tailwind CSS vars
// like var(--border) don't resolve. Use concrete values.
const EDGE_COLOR = "#475569"      // slate-600
const EDGE_COLOR_MALICIOUS = "#ef4444" // red-500 — edges touching a flagged node
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

function toFlowEdges(graph: ThreatGraph, nodes: Node<ThreatNodeData>[]): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return graph.edges.map((e) => {
    const { sourceHandle, targetHandle } = sideHandles(
      center(byId.get(e.source)),
      center(byId.get(e.target)),
    )
    const touchesMalicious = byId.get(e.source)?.data.severity === "malicious" || byId.get(e.target)?.data.severity === "malicious"
    const color = touchesMalicious ? EDGE_COLOR_MALICIOUS : EDGE_COLOR
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle,
      targetHandle,
      label: e.label,
      type: "smoothstep",
      pathOptions: { borderRadius: 24 },
      animated: e.source === "ip",
      style: { stroke: color, strokeWidth: touchesMalicious ? 2 : 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      labelStyle: { fill: EDGE_LABEL, fontSize: 10 },
      labelBgStyle: { fill: EDGE_LABEL_BG, fillOpacity: 0.85 },
      labelBgPadding: [4, 2] as [number, number],
    }
  })
}

function ThreatGraphInner({ graph }: { graph: ThreatGraph }) {
  const { fitView } = useReactFlow()
  const [nodes, , onNodesChange] = useNodesState<Node<ThreatNodeData>>(
    graph.nodes as Node<ThreatNodeData>[],
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    toFlowEdges(graph, graph.nodes as Node<ThreatNodeData>[]),
  )

  // Recompute which side each edge attaches to whenever node positions change
  // (initial render, prop change, or dragging a node) so connections always
  // take the shortest side and route as smooth curves.
  useEffect(() => {
    setEdges(toFlowEdges(graph, nodes))
  }, [graph, nodes, setEdges])

  // fitView as a prop only runs once, before node dimensions are measured, so
  // the graph can render off-center or zoomed wrong on first paint. Re-running
  // it imperatively on a couple of delayed passes (after layout/measurement
  // settles) keeps it centered without the user having to manually zoom/pan.
  useEffect(() => {
    const timers = [50, 200, 500].map((delay) =>
      setTimeout(() => fitView({ padding: 0.25, duration: 200 }), delay),
    )
    return () => timers.forEach(clearTimeout)
  }, [graph, fitView])

  const onNodeClick = useCallback((_: unknown, node: Node<ThreatNodeData>) => {
    const { href, copyable } = node.data
    if (href) {
      window.open(href, href.startsWith("http") ? "_blank" : "_self")
    } else if (copyable) {
      navigator.clipboard?.writeText(copyable)
    }
  }, [])

  return (
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
  )
}

export function ThreatGraphView({ graph }: { graph: ThreatGraph }) {
  return (
    <div className="h-[560px] w-full">
      <ReactFlowProvider>
        <ThreatGraphInner graph={graph} />
      </ReactFlowProvider>
    </div>
  )
}
