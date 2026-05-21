import { randomUUID } from 'crypto'
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { classifyRequest, type DetectionResult } from '../lib/attack-detector.js'

const BRUTE_WINDOW_MS = 60_000
const BRUTE_THRESHOLD = 5
const SKIP_PATHS      = new Set(['/health'])
const SKIP_PREFIXES   = ['/sensors/']

// Sliding window per IP for brute-force detection (in-memory, reset on restart)
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

export const defensePlugin = fp(async function (fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request) => {
    const path = (request.raw.url ?? '/').split('?')[0]
    if (SKIP_PATHS.has(path) || SKIP_PREFIXES.some(p => path.startsWith(p))) return

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
    if (SKIP_PATHS.has(path) || SKIP_PREFIXES.some(p => path.startsWith(p))) return

    if (trackBrute(request.ip)) {
      const ua = request.headers['user-agent'] ?? ''
      persist(fastify, request.ip, request.method, path, ua, {
        type: 'brute_force',
        details: { threshold: String(BRUTE_THRESHOLD), window: '60s' },
      }, reply.statusCode).catch(() => {})
    }
  })
})
