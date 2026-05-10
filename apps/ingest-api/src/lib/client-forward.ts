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

function isValidForwardUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

async function lookupClientForwardBySensorId(prisma: PrismaClient, sensorId: string) {
  const rows = await prisma.$queryRaw<Array<SensorClientForwardRow>>`
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

  return rows[0] ?? null
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
