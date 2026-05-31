import { readFileSync } from 'fs'
import type { FastifyInstance } from 'fastify'

function parseMeminfo() {
  try {
    const content = readFileSync('/proc/meminfo', 'utf8')
    const get = (key: string) => {
      const m = content.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))
      return m ? parseInt(m[1]) : 0
    }
    const totalKb     = get('MemTotal')
    const availableKb = get('MemAvailable')
    const usedKb      = totalKb - availableKb
    return {
      totalKb,
      availableKb,
      usedKb,
      usedPercent: totalKb > 0 ? Math.round((usedKb / totalKb) * 1000) / 10 : 0,
    }
  } catch {
    return { totalKb: 0, availableKb: 0, usedKb: 0, usedPercent: 0 }
  }
}

function parseLoadAvg(): [number, number, number] {
  try {
    const parts = readFileSync('/proc/loadavg', 'utf8').trim().split(' ')
    return [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])]
  } catch {
    return [0, 0, 0]
  }
}

function parseUptime(): number {
  try {
    return Math.floor(parseFloat(readFileSync('/proc/uptime', 'utf8').trim().split(' ')[0]))
  } catch {
    return 0
  }
}

function parseRedisInfo(raw: string) {
  const get = (key: string) => {
    const m = raw.match(new RegExp(`^${key}:(.+)$`, 'm'))
    return m ? m[1].trim() : null
  }
  const hits   = parseInt(get('keyspace_hits')   ?? '0')
  const misses = parseInt(get('keyspace_misses') ?? '0')
  const total  = hits + misses
  return {
    connected: true,
    version:           get('redis_version'),
    uptimeSeconds:     parseInt(get('uptime_in_seconds')        ?? '0'),
    memoryUsedBytes:   parseInt(get('used_memory')              ?? '0'),
    memoryPeakBytes:   parseInt(get('used_memory_peak')         ?? '0'),
    hitRate:           total > 0 ? Math.round((hits / total) * 1000) / 10 : null,
    opsPerSec:         parseInt(get('instantaneous_ops_per_sec') ?? '0'),
    connectedClients:  parseInt(get('connected_clients')         ?? '0'),
    totalCommands:     parseInt(get('total_commands_processed')  ?? '0'),
  }
}

export function readSystemMetrics() {
  const mem  = parseMeminfo()
  const load = parseLoadAvg()
  return {
    cpuLoad1m:  load[0],
    cpuLoad5m:  load[1],
    ramUsedKb:  mem.usedKb,
    ramTotalKb: mem.totalKb,
    ramPct:     mem.usedPercent,
  }
}

const RANGE_CONFIG = {
  '24h': { intervalMinutes: 5,   lookbackMs: 24 * 60 * 60 * 1000 },
  '7d':  { intervalMinutes: 60,  lookbackMs: 7  * 24 * 60 * 60 * 1000 },
  '30d': { intervalMinutes: 240, lookbackMs: 30 * 24 * 60 * 60 * 1000 },
} as const

type Range = keyof typeof RANGE_CONFIG

export async function monitoringRoutes(fastify: FastifyInstance) {
  fastify.get('/monitoring/system', async () => {
    const [memory, loadAvg, uptime, redisRaw] = await Promise.all([
      Promise.resolve(parseMeminfo()),
      Promise.resolve(parseLoadAvg()),
      Promise.resolve(parseUptime()),
      fastify.cache?.info() ?? Promise.resolve(null),
    ])

    return {
      system:  { uptime, loadAvg, memory },
      redis:   redisRaw ? parseRedisInfo(redisRaw) : { connected: false },
    }
  })

  fastify.get('/monitoring/history', async (request) => {
    const { range = '24h' } = request.query as { range?: string }
    const cfg = RANGE_CONFIG[(range as Range)] ?? RANGE_CONFIG['24h']
    const since = new Date(Date.now() - cfg.lookbackMs)
    const intervalSec = cfg.intervalMinutes * 60

    type BucketRow = {
      bucket: Date
      avg_cpu: number
      avg_ram_pct: number
      avg_ram_used_kb: number
      avg_ram_total_kb: number
    }

    const rows = await fastify.prisma.$queryRaw<BucketRow[]>`
      SELECT
        date_bin(
          (${intervalSec} || ' seconds')::interval,
          sampled_at,
          TIMESTAMP '2001-01-01'
        ) AS bucket,
        ROUND(AVG(cpu_load_1m)::numeric, 2)::float  AS avg_cpu,
        ROUND(AVG(ram_pct)::numeric, 1)::float       AS avg_ram_pct,
        ROUND(AVG(ram_used_kb)::numeric)::int        AS avg_ram_used_kb,
        ROUND(AVG(ram_total_kb)::numeric)::int       AS avg_ram_total_kb
      FROM monitoring_snapshots
      WHERE sampled_at >= ${since}
      GROUP BY bucket
      ORDER BY bucket ASC
    `

    return rows.map(r => ({
      ts:         r.bucket.toISOString(),
      cpu:        r.avg_cpu,
      ramPct:     r.avg_ram_pct,
      ramUsedKb:  r.avg_ram_used_kb,
      ramTotalKb: r.avg_ram_total_kb,
    }))
  })
}
