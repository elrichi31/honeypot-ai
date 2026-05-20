import type { PrismaClient } from '@prisma/client'

type SensorClientForwardRow = {
  client_id: string
  client_name: string
  client_slug: string
  forward_url: string
  sensor_id: string
  sensor_name: string
  sensor_protocol: string
  sensor_ip: string
}

type ClientForwardCacheEntry = {
  expiresAt: number
  target: SensorClientForwardRow | null
}

const CLIENT_FORWARD_CACHE_TTL_MS = 5 * 60 * 1000
const clientForwardCache = new Map<string, ClientForwardCacheEntry>()
const clientForwardLookupsInFlight = new Map<string, Promise<SensorClientForwardRow | null>>()

function isValidForwardUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

async function lookupClientForwardBySensorId(prisma: PrismaClient, sensorId: string) {
  const now = Date.now()
  const cached = clientForwardCache.get(sensorId)
  if (cached && cached.expiresAt > now) {
    return cached.target
  }

  const inFlight = clientForwardLookupsInFlight.get(sensorId)
  if (inFlight) {
    return inFlight
  }

  const lookupPromise = prisma.$queryRaw<Array<SensorClientForwardRow>>`
    SELECT
      c.id AS client_id,
      c.name AS client_name,
      c.slug AS client_slug,
      c.forward_url,
      s.sensor_id,
      s.name AS sensor_name,
      s.protocol AS sensor_protocol,
      s.ip AS sensor_ip
    FROM sensors s
    INNER JOIN clients c ON c.id = s.client_id
    WHERE s.sensor_id = ${sensorId}
    LIMIT 1
  `
    .then((rows) => rows[0] ?? null)
    .finally(() => {
      clientForwardLookupsInFlight.delete(sensorId)
    })

  clientForwardLookupsInFlight.set(sensorId, lookupPromise)

  const target = await lookupPromise
  clientForwardCache.set(sensorId, {
    expiresAt: now + CLIENT_FORWARD_CACHE_TTL_MS,
    target,
  })

  return target
}

export async function forwardClientEventBySensorId(
  prisma: PrismaClient,
  sensorId: string | null | undefined,
  payload: {
    kind: string
    receivedAt?: string
    event: Record<string, unknown>
  },
): Promise<void> {
  if (!sensorId) return

  const target = await lookupClientForwardBySensorId(prisma, sensorId)
  if (!target?.forward_url) return

  const forwardUrl = target.forward_url.trim()
  if (!forwardUrl || !isValidForwardUrl(forwardUrl)) return

  const body = {
    kind: payload.kind,
    receivedAt: payload.receivedAt ?? new Date().toISOString(),
    client: {
      id: target.client_id,
      name: target.client_name,
      slug: target.client_slug,
    },
    sensor: {
      sensorId: target.sensor_id,
      name: target.sensor_name,
      protocol: target.sensor_protocol,
      ip: target.sensor_ip,
    },
    event: payload.event,
  }

  try {
    const response = await fetch(forwardUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Honeypot-Client': target.client_slug,
        'X-Honeypot-Sensor': target.sensor_id,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      console.warn(`[client-forward] ${forwardUrl} returned ${response.status}`)
    }
  } catch (error) {
    console.warn(
      `[client-forward] delivery failed for client=${target.client_slug} sensor=${target.sensor_id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}
