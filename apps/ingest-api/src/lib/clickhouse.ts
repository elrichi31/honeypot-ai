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
    clickhouse_settings: {
      // Every analytics read uses FINAL (the lake tables are ReplacingMergeTree
      // and Kafka delivery is at-least-once, so unmerged duplicates are the
      // normal state, not an edge case). An event's dedup key starts with its
      // timestamp and the tables partition by month, so duplicates of a row can
      // only ever live in the same partition — merging across partitions to
      // satisfy FINAL is pure cost with nothing to find.
      do_not_merge_across_partitions_select_final: 1,
    },
  })
  return client
}

export async function closeClickHouseClient(): Promise<void> {
  await client?.close()
  client = null
}
