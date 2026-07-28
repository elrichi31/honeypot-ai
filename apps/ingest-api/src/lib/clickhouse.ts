import { createClient, type ClickHouseClient } from '@clickhouse/client'

// ANALYTICS_MODULE (docs/plans/ANALYTICS_MODULE.md): this client is used ONLY
// by the analytics module (modules/analytics/*) to read the KAFKA_LAKE
// ClickHouse tables. Every other module keeps talking to Postgres through
// Prisma as usual — this is not a general second database layer.
//
// Gated by CLICKHOUSE_URL exactly like KAFKA_BROKERS gates the lake producer:
// absent (or unreachable) -> analytics module disabled, nothing else breaks.

let client: ClickHouseClient | null = null

export function isClickHouseConfigured(): boolean {
  return !!process.env.CLICKHOUSE_URL
}

export function createClickHouseClient(): ClickHouseClient | null {
  if (!isClickHouseConfigured()) return null
  client = createClient({
    url: process.env.CLICKHOUSE_URL,
    username: process.env.CLICKHOUSE_USER ?? 'default',
    password: process.env.CLICKHOUSE_PASSWORD ?? '',
    database: process.env.CLICKHOUSE_DATABASE ?? 'honeypot_lake',
  })
  return client
}

export async function closeClickHouseClient(): Promise<void> {
  await client?.close()
  client = null
}
