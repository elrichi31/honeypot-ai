import type { ThreatDetail } from "./api/types"
import type { IpEnrichment } from "./ip-enrichment"
import { detectBotnetFamily, extractIocsFromCommands } from "./botnet-signatures"

/**
 * Pure builder that turns a ThreatDetail (+ optional IP enrichment) into a
 * node/edge graph for React Flow. No React imports — fully testable.
 *
 * Layout: a simple radial layout computed here (the IP at the center, every
 * other node placed on a ring by group + angle). This avoids pulling in a
 * layout library while still giving a readable starting position; React Flow
 * then handles pan/zoom/drag.
 */

export type ThreatNodeKind =
  | "ip"
  | "infra"
  | "protocol"
  | "credential"
  | "behavior"
  | "family"
  | "ioc"
  | "reputation"

export interface ThreatNodeData {
  kind: ThreatNodeKind
  label: string
  sub?: string
  /** category key for color lookup (command category, attack type, etc.) */
  category?: string
  /** risk level for the central node */
  level?: string
  /** a value that can be copied (IoC) */
  copyable?: string
  /** a link target (e.g. pivot to another IP) */
  href?: string
  [key: string]: unknown
}

export interface GraphNode {
  id: string
  type: "threatNode"
  position: { x: number; y: number }
  data: ThreatNodeData
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface ThreatGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// Minimum spacing so nodes never overlap: angular gap grows the further out a
// node sits is handled by picking a radius large enough for the node count.
const NODE_ARC = 200 // px of arc reserved per node along its ring

/**
 * Lays a list of nodes out along a ring, each group owning its own angular
 * sector so different groups never collide. The radius auto-grows when a sector
 * has many nodes, guaranteeing at least NODE_ARC px of arc between siblings.
 */
function sector(count: number, baseRadius: number, centerDeg: number, maxSpanDeg: number) {
  // radius needed so `count` nodes fit within maxSpan with NODE_ARC spacing
  const neededForSpacing = count > 1 ? (NODE_ARC * (count - 1)) / ((maxSpanDeg * Math.PI) / 180) : 0
  const radius = Math.max(baseRadius, neededForSpacing)
  const span = count > 1 ? maxSpanDeg : 0
  return (i: number) => {
    const deg = count <= 1 ? centerDeg : centerDeg - span / 2 + (span * i) / (count - 1)
    const rad = (deg * Math.PI) / 180
    return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius }
  }
}

export function buildThreatGraph(
  threat: ThreatDetail,
  enrichment: IpEnrichment | null,
): ThreatGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const ipId = "ip"

  // Center: the IP itself.
  nodes.push({
    id: ipId,
    type: "threatNode",
    position: { x: 0, y: 0 },
    data: {
      kind: "ip",
      label: threat.ip,
      sub: `${threat.risk.score}/100`,
      level: threat.risk.level,
      copyable: threat.ip,
    },
  })

  const addEdge = (source: string, target: string, label?: string) =>
    edges.push({ id: `${source}->${target}`, source, target, label })

  // Each group owns its own angular sector (degrees, screen coords: 0°=right,
  // 90°=down, 180°=left, 270°=up) so groups never collide.
  //   left   (180°) → infra + reputation
  //   up     (270°) → protocols
  //   down    (90°) → behavior
  //   right    (0°) → family + IoCs

  // ── Infra + Reputation (left sector) ───────────────────────────────────────
  const leftNodes: GraphNode[] = []
  const asn = enrichment?.ipinfo?.asn || (enrichment?.virustotal?.asn ? `AS${enrichment.virustotal.asn}` : "")
  const org = enrichment?.ipinfo?.org || enrichment?.virustotal?.as_owner || enrichment?.abuseipdb?.isp || ""
  const country = enrichment?.ipinfo?.country || enrichment?.virustotal?.country || enrichment?.abuseipdb?.countryName || ""
  if (asn || org || country) {
    leftNodes.push({
      id: "infra", type: "threatNode", position: { x: 0, y: 0 },
      data: { kind: "infra", label: org || asn || country, sub: [asn, country].filter(Boolean).join(" · ") },
    })
  }
  const repParts: string[] = []
  if (enrichment?.abuseipdb) repParts.push(`Abuse ${enrichment.abuseipdb.abuseConfidenceScore}%`)
  if (enrichment?.virustotal) {
    const s = enrichment.virustotal.last_analysis_stats
    repParts.push(`VT ${s.malicious}/${s.malicious + s.suspicious + s.harmless + s.undetected}`)
  }
  if (repParts.length > 0) {
    leftNodes.push({
      id: "reputation", type: "threatNode", position: { x: 0, y: 0 },
      data: { kind: "reputation", label: "Reputación", sub: repParts.join(" · ") },
    })
  }
  const leftPos = sector(leftNodes.length, 300, 180, 80)
  leftNodes.forEach((n, i) => {
    n.position = leftPos(i)
    nodes.push(n)
    addEdge(ipId, n.id, n.id === "infra" ? "alojado en" : "intel externa")
  })

  // ── Protocols (up sector) ──────────────────────────────────────────────────
  const protocolEntries: Array<{ id: string; label: string; sub: string }> = []
  if (threat.ssh) {
    protocolEntries.push({
      id: "proto-ssh", label: "SSH",
      sub: `${threat.ssh.sessions} ses · ${threat.ssh.authAttempts} auth${threat.ssh.loginSuccess ? " · ✓login" : ""}`,
    })
  }
  if (threat.web) protocolEntries.push({ id: "proto-http", label: "HTTP", sub: `${threat.web.hits} hits` })
  if (threat.protocols) {
    for (const [name, stats] of Object.entries(threat.protocols.byService)) {
      protocolEntries.push({
        id: `proto-${name}`, label: name.toUpperCase(),
        sub: `${stats.hits} hits${stats.ports.length ? ` · :${stats.ports.slice(0, 3).join(",")}` : ""}`,
      })
    }
  }
  if (threat.portScans && threat.portScans.events > 0) {
    protocolEntries.push({ id: "proto-portscan", label: "Port scan", sub: `${threat.portScans.uniquePorts} puertos` })
  }
  const protoPos = sector(protocolEntries.length, 300, 270, 150)
  protocolEntries.forEach((p, i) => {
    nodes.push({
      id: p.id, type: "threatNode", position: protoPos(i),
      data: { kind: "protocol", label: p.label, sub: p.sub, category: "scanner" },
    })
    addEdge(ipId, p.id)
  })

  // ── Credentials — one aggregated node, hung off the first protocol ──────────
  const creds = new Set<string>()
  if (threat.protocols) threat.protocols.usernames.slice(0, 5).forEach((u) => creds.add(u))
  if (creds.size > 0) {
    nodes.push({
      id: "credentials", type: "threatNode", position: { x: 360, y: -320 },
      data: { kind: "credential", label: "Credenciales", sub: [...creds].slice(0, 4).join(", ") },
    })
    addEdge(protocolEntries[0]?.id ?? ipId, "credentials", "probó")
  }

  // ── Behavior categories (down sector) ──────────────────────────────────────
  const activeCats = Object.entries(threat.risk.commandCategories).filter(([, c]) => c.length > 0)
  const behaviorPos = sector(activeCats.length, 300, 90, 150)
  activeCats.forEach(([cat, cmds], i) => {
    const id = `behavior-${cat}`
    nodes.push({
      id, type: "threatNode", position: behaviorPos(i),
      data: { kind: "behavior", label: cat, sub: `${cmds.length} cmd`, category: cat },
    })
    addEdge(ipId, id)
  })

  // ── Family attribution (right, near center) ────────────────────────────────
  const commands = threat.classifiedCommands.map((c) => c.command)
  const family = detectBotnetFamily(commands)
  if (family) {
    nodes.push({
      id: "family", type: "threatNode", position: { x: 320, y: 40 },
      data: { kind: "family", label: family.name, sub: family.category, category: "malware_drop" },
    })
    const anchor = activeCats[0] ? `behavior-${activeCats[0][0]}` : ipId
    addEdge(anchor, "family", "atribuido a")
  }

  // ── IoCs (right sector, outer ring). Dedup C2 by host:port. ─────────────────
  const iocs = extractIocsFromCommands(commands)
  const iocNodes: Array<{ id: string; label: string; sub: string; copyable: string; href?: string }> = []
  const seenC2 = new Set<string>()
  iocs.c2.forEach((c) => {
    const key = `${c.host}:${c.port ?? ""}`
    if (seenC2.has(key)) return
    seenC2.add(key)
    iocNodes.push({
      id: `ioc-c2-${seenC2.size}`, label: c.host, sub: `C2${c.port ? ` :${c.port}` : ""}`,
      copyable: c.value, href: `/threats/${encodeURIComponent(c.host)}`,
    })
  })
  iocs.sshKeys.forEach((k, i) =>
    iocNodes.push({
      id: `ioc-key-${i}`, label: k.comment ? `key · ${k.comment}` : k.algorithm,
      sub: "clave SSH plantada", copyable: k.raw,
    }),
  )
  iocs.malwareHashes.forEach((h, i) =>
    iocNodes.push({
      id: `ioc-hash-${i}`, label: `${h.slice(0, 12)}…`, sub: "hash SHA-256",
      copyable: h, href: `https://www.virustotal.com/gui/file/${h}`,
    }),
  )
  const iocPos = sector(iocNodes.length, 560, 0, 120)
  const iocAnchor = family ? "family" : ipId
  iocNodes.forEach((n, i) => {
    nodes.push({
      id: n.id, type: "threatNode", position: iocPos(i),
      data: { kind: "ioc", label: n.label, sub: n.sub, copyable: n.copyable, href: n.href },
    })
    addEdge(iocAnchor, n.id)
  })

  return { nodes, edges }
}
