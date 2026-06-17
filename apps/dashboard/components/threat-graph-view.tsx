"use client"

import { useCallback, useMemo } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
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
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !bg-border" />
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className={`truncate font-mono ${isCenter ? "text-sm font-semibold" : "text-xs"}`}>
          {data.label}
        </span>
      </div>
      {data.sub && <p className="mt-0.5 truncate text-[10px] opacity-70">{data.sub}</p>}
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !bg-border" />
    </div>
  )
}

const nodeTypes = { threatNode: ThreatNode }

export function ThreatGraphView({ graph }: { graph: ThreatGraph }) {
  const nodes = useMemo<Node<ThreatNodeData>[]>(
    () => graph.nodes as Node<ThreatNodeData>[],
    [graph.nodes],
  )
  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: e.source === "ip",
        style: { stroke: "var(--border)" },
        labelStyle: { fill: "var(--muted-foreground)", fontSize: 10 },
        labelBgStyle: { fill: "var(--card)" },
      })),
    [graph.edges],
  )

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
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={16} className="!bg-transparent" color="var(--border)" />
        <Controls className="!bg-card !border-border" showInteractive={false} />
        <MiniMap
          className="!bg-card !border-border"
          maskColor="rgba(0,0,0,0.4)"
          nodeColor="var(--muted-foreground)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  )
}
