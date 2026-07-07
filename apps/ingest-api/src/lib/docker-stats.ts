import http from 'http'
import { existsSync } from 'fs'
import { mapWithConcurrency } from './concurrency.js'

const SOCKET = existsSync('/host/var/run/docker.sock')
  ? '/host/var/run/docker.sock'
  : '/var/run/docker.sock'

// Re-checked with a short TTL instead of once at import — the socket mount can
// become available after this module loads (e.g. host mount race on boot).
const SOCKET_CHECK_TTL_MS = 30_000
let socketCheck: { at: number; available: boolean } | null = null
let warnedSocketMissing = false

function isSocketAvailable(): boolean {
  if (socketCheck && Date.now() - socketCheck.at < SOCKET_CHECK_TTL_MS) {
    return socketCheck.available
  }
  const available = existsSync(SOCKET)
  socketCheck = { at: Date.now(), available }
  if (!available && !warnedSocketMissing) {
    console.warn('[docker-stats] Docker socket not found at', SOCKET, '— container stats will be empty')
    warnedSocketMissing = true
  }
  if (available) warnedSocketMissing = false
  return available
}

interface DockerContainer { Id: string; Names: string[]; State: string }

interface DockerStats {
  cpu_stats: {
    cpu_usage:        { total_usage: number; percpu_usage?: number[] }
    system_cpu_usage: number
    online_cpus?:     number
  }
  precpu_stats: {
    cpu_usage:        { total_usage: number }
    system_cpu_usage: number
  }
  memory_stats: { usage?: number; cache?: number; stats?: { cache?: number } }
}

interface CachedSnapshot {
  cpu: number
  sys: number
}

export type ContainerStat = {
  container: string
  cpuPct:    number
  memMb:     number
}

const cronCache = new Map<string, CachedSnapshot>()

// Last successful cron sample — served by the live endpoint to avoid Docker socket hits on HTTP requests
let lastCronStats: { at: number; data: ContainerStat[] } | null = null


function dockerGet(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isSocketAvailable()) return reject(new Error('Docker socket not available'))
    const req = http.request(
      { socketPath: SOCKET, path, method: 'GET' },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => { chunks.push(chunk) })
        res.on('end', () => resolve(Buffer.concat(chunks).toString()))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

function calcCpuPct(
  current:  { cpu: number; sys: number },
  previous: { cpu: number; sys: number },
  cpus:     number,
): number {
  const cpuDelta = current.cpu - previous.cpu
  if (cpuDelta <= 0) return 0

  const sysDelta = current.sys - previous.sys
  if (sysDelta <= 0) return 0

  return Math.min(100 * cpus, Math.round((cpuDelta / sysDelta) * cpus * 100 * 10) / 10)
}

function calcMemMb(s: DockerStats): number {
  const usage = s.memory_stats.usage ?? 0
  const cache = s.memory_stats.stats?.cache ?? s.memory_stats.cache ?? 0
  return Math.round(((usage - cache) / 1024 / 1024) * 10) / 10
}

function getCpus(s: DockerStats): number {
  return s.cpu_stats.online_cpus
    ?? s.cpu_stats.cpu_usage.percpu_usage?.length
    ?? 1
}

async function getRunningContainers(): Promise<DockerContainer[]> {
  const listBody = await dockerGet('/containers/json')
  const containers: DockerContainer[] = JSON.parse(listBody)
  return containers.filter(c => c.State === 'running')
}

// Used by cron — fast (one-shot), bounded concurrency, cache-based delta
export async function sampleContainerStatsForCron(): Promise<ContainerStat[]> {
  if (!isSocketAvailable()) return []
  try {
    const running = await getRunningContainers()
    const limit = Math.min(5, running.length)
    const results = await mapWithConcurrency(running, limit, async (c) => {
      const name  = c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12)
      const body  = await dockerGet(`/containers/${c.Id}/stats?stream=false&one-shot=true`)
      const stats: DockerStats = JSON.parse(body)
      const cpus  = getCpus(stats)
      const cur   = { cpu: stats.cpu_stats.cpu_usage.total_usage ?? 0, sys: stats.cpu_stats.system_cpu_usage ?? 0 }
      const prev  = cronCache.get(c.Id)
      cronCache.set(c.Id, cur)
      return {
        container: name,
        cpuPct:    prev ? calcCpuPct(cur, prev, cpus) : 0,
        memMb:     calcMemMb(stats),
      }
    })
    const data = results
      .filter((r): r is PromiseFulfilledResult<ContainerStat> => r.status === 'fulfilled')
      .map(r => r.value)
      .sort((a, b) => b.cpuPct - a.cpuPct)
    lastCronStats = { at: Date.now(), data }
    return data
  } catch {
    return []
  }
}

// Used by live endpoint — returns the last cron sample; no Docker socket hit on the HTTP path
export async function sampleContainerStatsLive(): Promise<ContainerStat[]> {
  const MAX_AGE_MS = 90_000
  if (!lastCronStats || Date.now() - lastCronStats.at > MAX_AGE_MS) return []
  return lastCronStats.data
}
