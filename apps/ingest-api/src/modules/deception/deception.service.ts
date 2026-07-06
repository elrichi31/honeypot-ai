import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { DeceptionRepository, type Scope, type KillChainStepRow } from './deception.repository.js'
import { resolveClientSensors } from '../../lib/client-helpers.js'
import { withCache } from '../../lib/cache-helper.js'

export type { Scope }

export class DeceptionService {
  private repo: DeceptionRepository

  constructor(prisma: PrismaClient, prismaRead: PrismaClient) {
    this.repo = new DeceptionRepository(prismaRead, prisma)
  }

  async resolveScope(clientSlug: string): Promise<Scope | null> {
    return resolveClientSensors(this.repo['prismaRead'], clientSlug)
  }

  getOverview(cache: FastifyInstance['cache'], scope: Scope, cacheKey: string) {
    return withCache(cache, cacheKey, 30, () => this.repo.getOverview(scope))
  }

  getNodes(cache: FastifyInstance['cache'], scope: Scope, cacheKey: string) {
    return withCache(cache, cacheKey, 30, () => this.repo.getNodes(scope))
  }

  getKillchain(cache: FastifyInstance['cache'], scope: Scope, limit: number, cacheKey: string) {
    return withCache(cache, cacheKey, 30, async () => {
      const steps = await this.repo.getKillchain(scope, limit)
      return buildKillchains(steps)
    })
  }

  getEvents(scope: Scope, page: number, limit: number, nodeId: string | null) {
    return this.repo.getEvents(scope, page, limit, nodeId)
  }

  ingestPortscan(body: { id: string; sensorId: string; srcIp: string; dstPorts: number[]; nodeId?: string; scanType: string; timestamp: string }) {
    return this.repo.ingestPortscan(body)
  }

  getPortscans(scope: Scope, page: number, limit: number, nodeId: string | null) {
    return this.repo.getPortscans(scope, page, limit, nodeId)
  }
}

export function buildKillchains(steps: KillChainStepRow[]) {
  type Chain = {
    key: string; publicIp: string | null; sessionId: string | null
    correlation: 'probable' | 'none'; firstSeen: Date; lastSeen: Date
    steps: Array<{
      nodeId: string | null; nodeName: string | null; protocol: string; dstPort: number
      eventType: string; username: string | null; password: string | null
      timestamp: Date; logdata: unknown
      clientId: string | null; clientSlug: string | null; clientName: string | null
    }>
  }
  const chains = new Map<string, Chain>()

  for (const row of [...steps].reverse()) {
    const key = row.session_id ?? `internal:${row.src_ip ?? row.public_ip ?? 'unknown'}`
    let chain = chains.get(key)
    if (!chain) {
      chain = { key, publicIp: row.public_ip ?? row.src_ip, sessionId: row.session_id, correlation: row.session_id ? 'probable' : 'none', firstSeen: row.timestamp, lastSeen: row.timestamp, steps: [] }
      chains.set(key, chain)
    }
    chain.lastSeen = row.timestamp
    chain.steps.push({
      nodeId: row.node_id, nodeName: row.node_name, protocol: row.protocol, dstPort: row.dst_port,
      eventType: row.event_type, username: row.username, password: row.password, timestamp: row.timestamp, logdata: row.logdata,
      clientId: row.client_id, clientSlug: row.client_slug, clientName: row.client_name,
    })
  }

  return [...chains.values()]
    .map(c => ({
      ...c,
      nodesTouched: new Set(c.steps.map(s => s.nodeId).filter(Boolean)).size,
      durationSec: Math.max(0, Math.round((new Date(c.lastSeen).getTime() - new Date(c.firstSeen).getTime()) / 1000)),
    }))
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
}
