import { randomUUID } from 'crypto'
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { classifyRequest, type DetectionResult } from '../lib/attack-detector.js'

const BRUTE_WINDOW_MS = 60_000
const BRUTE_THRESHOLD = 5
const SKIP_PATHS      = new Set(['/health'])
const SKIP_PREFIXES   = ['/sensors/', '/ingest/']

// ── CIDR utilities ────────────────────────────────────────────────────────────
function parseCidr(entry: string): { base: number; mask: number } | null {
  const [addr, bits] = entry.trim().split('/')
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(addr)) return null
  const base = addr.split('.').reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0
  const mask = bits ? (~0 << (32 - parseInt(bits))) >>> 0 : 0xffffffff
  return { base: base & mask, mask }
}

// RFC 1918 + loopback — always trusted, never stored in DB
const PRIVATE_CIDRS = [
  { base: 0x0a000000, mask: 0xff000000 }, // 10.0.0.0/8
  { base: 0xac100000, mask: 0xfff00000 }, // 172.16.0.0/12
  { base: 0xc0a80000, mask: 0xffff0000 }, // 192.168.0.0/16
  { base: 0x7f000000, mask: 0xff000000 }, // 127.0.0.0/8
]

// In-memory allowlist cache — refreshed from DB every 30s
let allowlistCache: Array<{ base: number; mask: number }> = [...PRIVATE_CIDRS]

async function refreshAllowlist(fastify: FastifyInstance) {
  const rows = await fastify.prisma.$queryRaw<{ entry: string }[]>`
    SELECT entry FROM defense_allowlist
  `
  const dynamic = rows.map(r => parseCidr(r.entry)).filter(Boolean) as Array<{ base: number; mask: number }>
  allowlistCache = [...PRIVATE_CIDRS, ...dynamic]
}

function isAllowlisted(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd')) return true
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return false
  const n = v4.split('.').reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0
  return allowlistCache.some(({ base, mask }) => (n & mask) === base)
}

// ── Brute-force sliding window ────────────────────────────────────────────────
const bruteMap = new Map<string, { count: number; windowStart: number }>()

setInterval(() => {
  const cutoff = Date.now() - BRUTE_WINDOW_MS * 2
  for (const [ip, e] of bruteMap) {
    if (e.windowStart < cutoff) bruteMap.delete(ip)
  }
}, 60_000).unref()

function trackBrute(ip: string): boolean {
  const now = Date.now()
  const e   = bruteMap.get(ip)
  if (!e || now - e.windowStart > BRUTE_WINDOW_MS) {
    bruteMap.set(ip, { count: 1, windowStart: now })
    return false
  }
  e.count++
  return e.count >= BRUTE_THRESHOLD
}

// ── Persist ───────────────────────────────────────────────────────────────────
async function persist(
  fastify: FastifyInstance,
  srcIp: string, method: string, path: string,
  userAgent: string, result: DetectionResult, statusCode?: number,
) {
  const id      = randomUUID()
  const details = JSON.stringify(result.details)
  await fastify.prisma.$executeRaw`
    INSERT INTO api_defense_events (id, src_ip, method, path, user_agent, attack_type, details, status_code, timestamp)
    VALUES (${id}, ${srcIp}, ${method}, ${path}, ${userAgent}, ${result.type}, ${details}::jsonb, ${statusCode ?? null}, now())
  `
}

function shouldSkip(ip: string, path: string): boolean {
  return isAllowlisted(ip) ||
    SKIP_PATHS.has(path) ||
    SKIP_PREFIXES.some(p => path.startsWith(p))
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export const defensePlugin = fp(async function (fastify: FastifyInstance) {
  // Load allowlist from DB on startup, then refresh every 30s
  await refreshAllowlist(fastify).catch(() => {})
  setInterval(() => refreshAllowlist(fastify).catch(() => {}), 30_000).unref()

  fastify.addHook('onRequest', async (request) => {
    const path = (request.raw.url ?? '/').split('?')[0]
    if (shouldSkip(request.ip, path)) return

    const ua     = request.headers['user-agent'] ?? ''
    const rawUrl = request.raw.url ?? '/'
    const result = classifyRequest(path, ua, rawUrl)
    if (result) {
      persist(fastify, request.ip, request.method, path, ua, result).catch(() => {})
    }
  })

  fastify.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode !== 401 && reply.statusCode !== 403) return
    const path = (request.raw.url ?? '/').split('?')[0]
    if (shouldSkip(request.ip, path)) return

    if (trackBrute(request.ip)) {
      const ua = request.headers['user-agent'] ?? ''
      persist(fastify, request.ip, request.method, path, ua, {
        type: 'brute_force',
        details: { threshold: String(BRUTE_THRESHOLD), window: '60s' },
      }, reply.statusCode).catch(() => {})
    }
  })
})
