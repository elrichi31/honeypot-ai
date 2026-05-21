import type { PrismaClient } from '@prisma/client'

type ClientSensors = { clientId: string; sensorIds: string[] }

export async function resolveClientSensors(
  prisma: PrismaClient,
  clientSlug: string,
): Promise<ClientSensors | null> {
  const clientRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM clients WHERE slug = ${clientSlug} LIMIT 1
  `
  if (!clientRows[0]) return null

  const sensorRows = await prisma.$queryRaw<Array<{ sensor_id: string }>>`
    SELECT sensor_id FROM sensors WHERE client_id = ${clientRows[0].id}
  `
  return {
    clientId: clientRows[0].id,
    sensorIds: sensorRows.map(r => r.sensor_id),
  }
}

export function buildPagination(page: number, pageSize: number, total: number) {
  const totalPages = Math.ceil(total / pageSize)
  return { page, pageSize, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 }
}
