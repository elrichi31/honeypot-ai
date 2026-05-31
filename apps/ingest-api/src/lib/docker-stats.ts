import http from 'http'
import { existsSync } from 'fs'

const SOCKET = existsSync('/host/var/run/docker.sock')
  ? '/host/var/run/docker.sock'
  : '/var/run/docker.sock'

const SOCKET_AVAILABLE = existsSync(SOCKET)

interface DockerContainer { Id: string; Names: string[]; State: string }

interface CpuStats {
  cpu_usage:        { total_usage: number; percpu_usage?: number[] }
  system_cpu_usage: number
  online_cpus?:     number
}

interface DockerStats {
  id:           string
  cpu_stats:    CpuStats
  precpu_stats: CpuStats
  memory_stats: { usage?: number; cache?: number; stats?: { cache?: number } }
}

// Cache of the previous cpu snapshot per container id
const prevCache = new Map<string, { cpuUsage: number; sysCpuUsage: number }>()

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

function calcCpuPct(id: string, s: DockerStats): number {
  const curCpu = s.cpu_stats.cpu_usage.total_usage
  const curSys = s.cpu_stats.system_cpu_usage
  const cpus   = s.cpu_stats.online_cpus
    ?? s.cpu_stats.cpu_usage.percpu_usage?.length
    ?? 1

  const prev = prevCache.get(id)
  prevCache.set(id, { cpuUsage: curCpu, sysCpuUsage: curSys })

  if (!prev) return 0

  const cpuDelta = curCpu - prev.cpuUsage
  const sysDelta = curSys - prev.sysCpuUsage
  if (sysDelta <= 0 || cpuDelta < 0) return 0
  return Math.round((cpuDelta / sysDelta) * cpus * 100 * 10) / 10
}

function calcMemMb(s: DockerStats): number {
  const usage = s.memory_stats.usage ?? 0
  // Docker reports cache separately in memory_stats.stats.cache (cgroups v2)
  // or memory_stats.cache (cgroups v1)
  const cache = s.memory_stats.stats?.cache ?? s.memory_stats.cache ?? 0
  return Math.round(((usage - cache) / 1024 / 1024) * 10) / 10
}

export type ContainerStat = {
  container: string
  cpuPct:    number
  memMb:     number
}

export async function sampleContainerStats(): Promise<ContainerStat[]> {
  if (!SOCKET_AVAILABLE) return []

  try {
    const listBody = await dockerGet('/containers/json')
    const containers: DockerContainer[] = JSON.parse(listBody)
    const running = containers.filter(c => c.State === 'running')

    const results = await Promise.allSettled(
      running.map(async (c) => {
        const name = c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12)
        // one-shot=true returns fast; we compute delta against our own cache
        const body  = await dockerGet(`/containers/${c.Id}/stats?stream=false&one-shot=true`)
        const stats: DockerStats = JSON.parse(body)
        return {
          container: name,
          cpuPct:    calcCpuPct(c.Id, stats),
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
