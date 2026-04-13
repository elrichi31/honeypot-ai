import type { ApiSession } from "./api"

export interface SessionProfile {
  sessionId: string
  srcIp: string
  hassh: string | null
  username: string | null
  commandSet: Set<string>        // normalized commands (first word)
  commandSeq: string             // joined sequence fingerprint
  domains: Set<string>           // domains/IPs extracted from commands
  paths: Set<string>             // file paths used
}

export interface BehaviorCluster {
  id: string
  sessions: ApiSession[]
  similarity: number             // 0–1 average Jaccard
  sharedCommands: string[]
  sharedDomains: string[]
  dominantUsername: string | null
  profileLabel: string           // human-readable description
}

// ----- Profile extraction -----

// Normalize a command to its "base" (binary + first significant arg)
function normalizeCommand(cmd: string): string {
  const parts = cmd.trim().split(/\s+/)
  const bin = parts[0].replace(/^.*\//, "")   // strip path
  const arg = parts[1] ?? ""
  return arg ? `${bin} ${arg}` : bin
}

const DOMAIN_RE = /(?:https?:\/\/|ftp:\/\/)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(\/[^\s]*)?/g
const PATH_RE = /\/(tmp|var|etc|usr|home|root|bin|sbin|proc)\S*/g

export function buildProfile(
  session: ApiSession,
  commands: string[]
): SessionProfile {
  const commandSet = new Set(commands.map(normalizeCommand))
  const commandSeq = [...commandSet].sort().join("|")

  const domains = new Set<string>()
  const paths = new Set<string>()

  for (const cmd of commands) {
    for (const m of cmd.matchAll(DOMAIN_RE)) {
      const h = m[1].toLowerCase()
      if (!h.match(/^\d+\.\d+\.\d+\.\d+$/)) domains.add(h)   // skip raw IPs
    }
    for (const m of cmd.matchAll(PATH_RE)) paths.add(m[0])
  }

  return {
    sessionId: session.id,
    srcIp: session.srcIp,
    hassh: session.hassh,
    username: session.username,
    commandSet,
    commandSeq,
    domains,
    paths,
  }
}

// ----- Jaccard similarity -----

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const v of a) if (b.has(v)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

// ----- Union-Find for clustering -----

class UnionFind {
  private parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x])
    return this.parent[x]
  }
  union(x: number, y: number) {
    this.parent[this.find(x)] = this.find(y)
  }
}

// ----- Main clustering function -----

export function clusterSessions(
  sessions: ApiSession[],
  commandsMap: Record<string, string[]>,
  threshold = 0.4
): BehaviorCluster[] {
  if (sessions.length < 2) return []

  const profiles = sessions.map((s) =>
    buildProfile(s, commandsMap[s.id] ?? [])
  )

  const uf = new UnionFind(profiles.length)
  const simMatrix: number[][] = Array.from({ length: profiles.length }, () =>
    new Array(profiles.length).fill(0)
  )

  // O(n²) — fine for <500 sessions
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const sim = jaccard(profiles[i].commandSet, profiles[j].commandSet)
      simMatrix[i][j] = sim
      simMatrix[j][i] = sim
      if (sim >= threshold) uf.union(i, j)
    }
  }

  // Group by cluster root
  const groups = new Map<number, number[]>()
  for (let i = 0; i < profiles.length; i++) {
    const root = uf.find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(i)
  }

  const clusters: BehaviorCluster[] = []

  for (const [, indices] of groups.entries()) {
    if (indices.length < 2) continue   // singleton → not a cluster

    // Compute average similarity within cluster
    let simSum = 0
    let simCount = 0
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        simSum += simMatrix[indices[a]][indices[b]]
        simCount++
      }
    }
    const avgSim = simCount > 0 ? simSum / simCount : 0

    // Shared commands across ALL sessions in cluster
    const sets = indices.map((i) => profiles[i].commandSet)
    const sharedCommands = sets.length > 0
      ? [...sets[0]].filter((cmd) => sets.every((s) => s.has(cmd)))
      : []

    // Shared domains
    const domainSets = indices.map((i) => profiles[i].domains)
    const sharedDomains = domainSets.length > 0
      ? [...domainSets[0]].filter((d) => domainSets.every((s) => s.has(d)))
      : []

    // Dominant username
    const usernames = indices.map((i) => profiles[i].username).filter(Boolean) as string[]
    const uCounts = new Map<string, number>()
    for (const u of usernames) uCounts.set(u, (uCounts.get(u) ?? 0) + 1)
    const dominantUsername = [...uCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    // Label
    let profileLabel = `${indices.length} sesiones similares`
    if (sharedCommands.length > 0) profileLabel += ` · comandos comunes: ${sharedCommands.slice(0, 3).join(", ")}`
    else if (dominantUsername) profileLabel += ` · usuario frecuente: ${dominantUsername}`

    clusters.push({
      id: `cluster-${indices[0]}`,
      sessions: indices.map((i) => sessions[i]),
      similarity: Math.round(avgSim * 100) / 100,
      sharedCommands,
      sharedDomains,
      dominantUsername,
      profileLabel,
    })
  }

  return clusters.sort((a, b) => b.sessions.length - a.sessions.length)
}
