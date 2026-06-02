import http from 'http'
import { existsSync } from 'fs'

const SOCKET = existsSync('/host/var/run/docker.sock')
  ? '/host/var/run/docker.sock'
  : '/var/run/docker.sock'

const SOCKET_AVAILABLE = existsSync(SOCKET)

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

// Separate caches for cron vs live endpoint — prevents interference
const cronCache = new Map<string, CachedSnapshot>()

function dockerGet(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!SOCKET_AVAILABLE) return reject(new Error('Docker socket not available'))
    const req = http.request(
      { socketPath: SOCKET, path, method: 'GET' },
      (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => resolve(body))
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

export type ContainerStat = {
  container: string
  cpuPct:    number
  memMb:     number
}

// Used by cron — fast (one-shot), cache-based delta across consecutive calls
export async function sampleContainerStatsForCron(): Promise<ContainerStat[]> {
  if (!SOCKET_AVAILABLE) return []
  try {
    const running = await getRunningContainers()
    const results = await Promise.allSettled(
      running.map(async (c) => {
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
      }),
    )
    return results
      .filter((r): r is PromiseFulfilledResult<ContainerStat> => r.status === 'fulfilled')
      .map(r => r.value)
      .sort((a, b) => b.cpuPct - a.cpuPct)
  } catch {
    return []
  }
}

// Used by live endpoint — takes two readings 500ms apart for accurate CPU%
export async function sampleContainerStatsLive(): Promise<ContainerStat[]> {
  if (!SOCKET_AVAILABLE) return []
  try {
    const running = await getRunningContainers()

    // First snapshot
    const snap1 = await Promise.allSettled(
      running.map(async (c) => {
        const body  = await dockerGet(`/containers/${c.Id}/stats?stream=false&one-shot=true`)
        const stats: DockerStats = JSON.parse(body)
        return { id: c.Id, name: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12), stats }
      }),
    )

    await new Promise(r => setTimeout(r, 500))

    // Second snapshot
    const snap2 = await Promise.allSettled(
      running.map(async (c) => {
        const body  = await dockerGet(`/containers/${c.Id}/stats?stream=false&one-shot=true`)
        const stats: DockerStats = JSON.parse(body)
        return { id: c.Id, stats }
      }),
    )

    const map1 = new Map(
      snap1
        .filter((r): r is PromiseFulfilledResult<{ id: string; name: string; stats: DockerStats }> => r.status === 'fulfilled')
        .map(r => [r.value.id, r.value]),
    )

    return snap2
      .filter((r): r is PromiseFulfilledResult<{ id: string; stats: DockerStats }> => r.status === 'fulfilled')
      .map(r => {
        const prev = map1.get(r.value.id)
        if (!prev) return null
        const cpus = getCpus(r.value.stats)
        const cur  = { cpu: r.value.stats.cpu_stats.cpu_usage.total_usage ?? 0, sys: r.value.stats.cpu_stats.system_cpu_usage ?? 0 }
        const pre  = { cpu: prev.stats.cpu_stats.cpu_usage.total_usage ?? 0, sys: prev.stats.cpu_stats.system_cpu_usage ?? 0 }
        return {
          container: prev.name,
          cpuPct:    calcCpuPct(cur, pre, cpus),
          memMb:     calcMemMb(r.value.stats),
        }
      })
      .filter((r): r is ContainerStat => r !== null)
      .sort((a, b) => b.cpuPct - a.cpuPct)
  } catch {
    return []
  }
}
