import type { PrismaClient } from '@prisma/client'

// Cowrie events carry no layer marker (it's a third-party honeypot), so the only
// way to tell an internal deception SSH node from an internet-facing one is the
// sensor row (internal nodes heartbeat protocol='deception'). Cache it — the hot
// path only asks when a private-source event would otherwise be dropped.
const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { expiresAt: number; value: boolean }>()
const inFlight = new Map<string, Promise<boolean>>()

export async function isDeceptionSensor(prisma: PrismaClient, sensorId: string): Promise<boolean> {
  const now = Date.now()
  const cached = cache.get(sensorId)
  if (cached && cached.expiresAt > now) return cached.value

  const running = inFlight.get(sensorId)
  if (running) return running

  const lookup = prisma
    .$queryRaw<Array<{ ok: boolean }>>`
      SELECT protocol = 'deception' AS ok FROM sensors WHERE sensor_id = ${sensorId} LIMIT 1
    `
    .then((rows) => rows[0]?.ok ?? false)
    .finally(() => inFlight.delete(sensorId))

  inFlight.set(sensorId, lookup)
  const value = await lookup
  cache.set(sensorId, { expiresAt: now + TTL_MS, value })
  return value
}
