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

const RING = { infra: 240, primary: 240, secondary: 440 }

/** Places a list of ids evenly on an arc and returns their x/y by index. */
function radial(count: number, radius: number, startDeg: number, spanDeg: number) {
  return (i: number) => {
    const angle =
      count <= 1
        ? (startDeg + spanDeg / 2) * (Math.PI / 180)
        : (startDeg + (spanDeg * i) / (count - 1)) * (Math.PI / 180)
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
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

  // ── Infra (ASN / org / country) — left side ────────────────────────────────
  const asn = enrichment?.ipinfo?.asn || (enrichment?.virustotal?.asn ? `AS${enrichment.virustotal.asn}` : "")
  const org = enrichment?.ipinfo?.org || enrichment?.virustotal?.as_owner || enrichment?.abuseipdb?.isp || ""
  const country = enrichment?.ipinfo?.country || enrichment?.virustotal?.country || enrichment?.abuseipdb?.countryName || ""
  if (asn || org || country) {
    nodes.push({
      id: "infra",
      type: "threatNode",
      position: { x: -RING.infra, y: -80 },
      data: {
        kind: "infra",
        label: org || asn || country,
        sub: [asn, country].filter(Boolean).join(" · "),
      },
    })
    addEdge(ipId, "infra", "alojado en")
  }

  // ── Reputation (AbuseIPDB + VirusTotal) — left/lower ────────────────────────
  const repParts: string[] = []
  if (enrichment?.abuseipdb) repParts.push(`Abuse ${enrichment.abuseipdb.abuseConfidenceScore}%`)
  if (enrichment?.virustotal) {
    const s = enrichment.virustotal.last_analysis_stats
    repParts.push(`VT ${s.malicious}/${s.malicious + s.suspicious + s.harmless + s.undetected}`)
  }
  if (repParts.length > 0) {
    nodes.push({
      id: "reputation",
      type: "threatNode",
      position: { x: -RING.infra, y: 120 },
      data: {
        kind: "reputation",
        label: "Reputación",
        sub: repParts.join(" · "),
      },
    })
    addEdge(ipId, "reputation", "intel externa")
  }

  // ── Protocols (services touched) — top arc ─────────────────────────────────
  const protocolEntries: Array<{ id: string; label: string; sub: string }> = []
  if (threat.ssh) {
    protocolEntries.push({
      id: "proto-ssh",
      label: "SSH",
      sub: `${threat.ssh.sessions} ses · ${threat.ssh.authAttempts} auth${threat.ssh.loginSuccess ? " · ✓login" : ""}`,
    })
  }
  if (threat.web) {
    protocolEntries.push({
      id: "proto-http",
      label: "HTTP",
      sub: `${threat.web.hits} hits`,
    })
  }
  if (threat.protocols) {
    for (const [name, stats] of Object.entries(threat.protocols.byService)) {
      protocolEntries.push({
        id: `proto-${name}`,
        label: name.toUpperCase(),
        sub: `${stats.hits} hits${stats.ports.length ? ` · :${stats.ports.slice(0, 3).join(",")}` : ""}`,
      })
    }
  }
  if (threat.portScans && threat.portScans.events > 0) {
    protocolEntries.push({
      id: "proto-portscan",
      label: "Port scan",
      sub: `${threat.portScans.uniquePorts} puertos`,
    })
  }
  const protoPos = radial(protocolEntries.length, RING.primary, 200, 140)
  protocolEntries.forEach((p, i) => {
    const pos = protoPos(i)
    nodes.push({
      id: p.id,
      type: "threatNode",
      position: pos,
      data: { kind: "protocol", label: p.label, sub: p.sub, category: "scanner" },
    })
    addEdge(ipId, p.id)
  })

  // ── Credentials — attached to SSH/proto, shown as one aggregated node ───────
  const creds = new Set<string>()
  if (threat.protocols) {
    threat.protocols.usernames.slice(0, 5).forEach((u) => creds.add(u))
  }
  if (creds.size > 0) {
    nodes.push({
      id: "credentials",
      type: "threatNode",
      position: { x: RING.primary - 40, y: -180 },
      data: {
        kind: "credential",
        label: "Credenciales",
        sub: [...creds].slice(0, 4).join(", "),
      },
    })
    addEdge(protocolEntries[0]?.id ?? ipId, "credentials", "probó")
  }

  // ── Behavior categories — bottom arc ───────────────────────────────────────
  const activeCats = Object.entries(threat.risk.commandCategories).filter(([, c]) => c.length > 0)
  const behaviorPos = radial(activeCats.length, RING.primary, 20, 140)
  activeCats.forEach(([cat, cmds], i) => {
    const id = `behavior-${cat}`
    const pos = behaviorPos(i)
    nodes.push({
      id,
      type: "threatNode",
      position: pos,
      data: { kind: "behavior", label: cat, sub: `${cmds.length} cmd`, category: cat },
    })
    addEdge(ipId, id)
  })

  // ── Family attribution ─────────────────────────────────────────────────────
  const commands = threat.classifiedCommands.map((c) => c.command)
  const family = detectBotnetFamily(commands)
  if (family) {
    nodes.push({
      id: "family",
      type: "threatNode",
      position: { x: 0, y: RING.secondary },
      data: {
        kind: "family",
        label: family.name,
        sub: family.category,
        category: "malware_drop",
      },
    })
    // Link the family from the most relevant behavior node, else from the IP.
    const anchor = activeCats[0] ? `behavior-${activeCats[0][0]}` : ipId
    addEdge(anchor, "family", "atribuido a")
  }

  // ── IoCs (C2 / SSH keys / hashes) — right/bottom arc ───────────────────────
  const iocs = extractIocsFromCommands(commands)
  const iocNodes: Array<{ id: string; label: string; sub: string; copyable: string; href?: string }> = []
  iocs.c2.forEach((c, i) =>
    iocNodes.push({
      id: `ioc-c2-${i}`,
      label: c.host,
      sub: `C2${c.port ? ` :${c.port}` : ""}`,
      copyable: c.value,
      href: `/threats/${encodeURIComponent(c.host)}`,
    }),
  )
  iocs.sshKeys.forEach((k, i) =>
    iocNodes.push({
      id: `ioc-key-${i}`,
      label: k.comment ? `key · ${k.comment}` : k.algorithm,
      sub: "clave SSH plantada",
      copyable: k.raw,
    }),
  )
  iocs.malwareHashes.forEach((h, i) =>
    iocNodes.push({
      id: `ioc-hash-${i}`,
      label: `${h.slice(0, 12)}…`,
      sub: "hash SHA-256",
      copyable: h,
      href: `https://www.virustotal.com/gui/file/${h}`,
    }),
  )
  const iocPos = radial(iocNodes.length, RING.secondary, 320, 110)
  const iocAnchor = family ? "family" : ipId
  iocNodes.forEach((n, i) => {
    const pos = iocPos(i)
    nodes.push({
      id: n.id,
      type: "threatNode",
      position: pos,
      data: { kind: "ioc", label: n.label, sub: n.sub, copyable: n.copyable, href: n.href },
    })
    addEdge(iocAnchor, n.id)
  })

  return { nodes, edges }
}
