import { randomUUID } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { buildPagination } from '../../lib/client-helpers.js'
import { ApiDefenseRepository, type EventRow, type AllowRow, type BlockedRow } from './api-defense.repository.js'

const VALID_TYPES = new Set(['scanner', 'path_probe', 'injection', 'brute_force', 'rate_limit'])

function mapEvent(r: EventRow) {
  return {
    id: r.id, srcIp: r.src_ip, method: r.method, path: r.path,
    userAgent: r.user_agent, attackType: r.attack_type,
    details: (() => { try { return JSON.parse(r.details) } catch { return {} } })(),
    statusCode: r.status_code, timestamp: r.timestamp,
  }
}

function mapAllow(r: AllowRow) {
  return { id: r.id, entry: r.entry, label: r.label, createdAt: r.created_at }
}

function mapBlocked(r: BlockedRow) {
  return { id: r.id, ip: r.ip, reason: r.reason, autoBlocked: r.auto_blocked, blockedAt: r.blocked_at }
}

// Postgres unique-violation, reported by Prisma as P2010 (raw query failed)
// with the pg error code 23505 in `meta.code` — the top-level `message` never
// contains "unique"/"duplicate", only the raw Postgres text embedded in `meta`.
function isDuplicateKeyError(err: unknown): boolean {
  const meta = (err as { meta?: { code?: unknown } } | undefined)?.meta
  return meta?.code === '23505'
}

export class ApiDefenseService {
  private repo: ApiDefenseRepository

  constructor(prisma: PrismaClient) {
    this.repo = new ApiDefenseRepository(prisma)
  }

  async listEvents(args: { page: number; pageSize: number; attackType?: string; ip?: string }) {
    const { page, pageSize, attackType, ip } = args
    const validType = attackType && VALID_TYPES.has(attackType) ? attackType : undefined
    const offset = (page - 1) * pageSize
    const { rows, total } = await this.repo.listEvents({ limit: pageSize, offset, attackType: validType, ip })
    return { items: rows.map(mapEvent), pagination: buildPagination(page, pageSize, total) }
  }

  async getSummary() {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const { typeCounts, topIps, totalToday } = await this.repo.getSummary(todayStart)
    return {
      totalToday,
      byType: typeCounts.map(r => ({ type: r.attack_type, count: Number(r.count) })),
      topIps: topIps.map(r => ({ ip: r.src_ip, count: Number(r.count) })),
    }
  }

  async listAllowlist() {
    return (await this.repo.listAllowlist()).map(mapAllow)
  }

  async createAllowlistEntry(entry: string, label: string): Promise<{ error: string; status: number } | ReturnType<typeof mapAllow>> {
    const id = randomUUID()
    try {
      await this.repo.insertAllowlistEntry(id, entry, label)
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) return { error: 'Entry already exists', status: 409 }
      throw err
    }
    return { id, entry, label, createdAt: new Date() }
  }

  async deleteAllowlistEntry(id: string): Promise<boolean> {
    return (await this.repo.deleteAllowlistEntry(id)) > 0
  }

  async listBlocked() {
    return (await this.repo.listBlocked()).map(mapBlocked)
  }

  async createBlocked(ip: string, reason: string): Promise<{ error: string; status: number } | ReturnType<typeof mapBlocked>> {
    const id = randomUUID()
    try {
      await this.repo.insertBlocked(id, ip, reason)
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) return { error: 'IP is already blocked', status: 409 }
      throw err
    }
    return { id, ip, reason, autoBlocked: false, blockedAt: new Date() }
  }

  async deleteBlocked(id: string): Promise<boolean> {
    return (await this.repo.deleteBlocked(id)) > 0
  }
}
