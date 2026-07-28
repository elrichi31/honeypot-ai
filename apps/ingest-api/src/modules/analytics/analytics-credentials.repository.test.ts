import type { ClickHouseClient } from '@clickhouse/client'
import { describe, expect, it, vi } from 'vitest'
import { parseClickHouseScope } from '../../lib/clickhouse-scope.js'
import { AnalyticsCredentialsRepository } from './analytics-credentials.repository.js'

function createRepository(rows: unknown[] = []) {
  const json = vi.fn().mockResolvedValue(rows)
  const query = vi.fn().mockResolvedValue({ json })
  const client = { query } as unknown as ClickHouseClient
  return { repo: new AnalyticsCredentialsRepository(client), query, json }
}

describe('AnalyticsCredentialsRepository', () => {
  it('queries top combos across Cowrie and protocol auth events with tenant scope', async () => {
    const { repo, query } = createRepository()
    const scope = parseClickHouseScope({ sensorIds: 'sensor-b,sensor-a' })

    await repo.getTopCombos(30, 20, scope)

    const options = query.mock.calls[0]?.[0]
    expect(options.query).toContain("eventid IN ('cowrie.login.success', 'cowrie.login.failed')")
    expect(options.query).toContain("event_type = 'auth'")
    expect(options.query).toContain('AND sensor_id IN {sensorIds:Array(String)}')
    expect(options.query_params).toEqual({
      rangeDays: 30,
      limit: 20,
      sensorIds: ['sensor-b', 'sensor-a'],
    })
  })

  it('detects campaigns in explicit five-minute windows and keeps unknown protocol outcomes separate', async () => {
    const { repo, query } = createRepository()

    await repo.getCampaigns(90, 10, 100, parseClickHouseScope({ sensorIds: '__none__' }))

    const options = query.mock.calls[0]?.[0]
    expect(options.query).toContain('INTERVAL 5 MINUTE')
    expect(options.query).toContain('countIf(result IS NULL) AS unknownCount')
    expect(options.query).toContain('HAVING attempts >= {minimumAttempts:UInt16}')
    expect(options.query).toContain('AND false')
    expect(options.query_params).toEqual({ rangeDays: 90, minimumAttempts: 10, limit: 100 })
  })

  it('computes success rate from Cowrie only with the requested granularity', async () => {
    const { repo, query } = createRepository()

    await repo.getSuccessRate(365, 'week', parseClickHouseScope({}))

    const options = query.mock.calls[0]?.[0]
    expect(options.query).toContain('toStartOfWeek(timestamp)')
    expect(options.query).toContain('FROM cowrie_events')
    expect(options.query).not.toContain('protocol_events')
    expect(options.query_params).toEqual({ rangeDays: 365 })
  })
})
