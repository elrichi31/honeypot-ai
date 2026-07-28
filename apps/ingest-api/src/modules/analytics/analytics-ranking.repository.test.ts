import type { ClickHouseClient } from '@clickhouse/client'
import { describe, expect, it, vi } from 'vitest'
import { parseClickHouseScope } from '../../lib/clickhouse-scope.js'
import { AnalyticsRankingRepository } from './analytics-ranking.repository.js'

describe('AnalyticsRankingRepository', () => {
  it('ranks attackers across all lake sources with mandatory tenant scope', async () => {
    const query = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([]),
    })
    const repository = new AnalyticsRankingRepository(
      { query } as unknown as ClickHouseClient,
    )

    await repository.getTopAttackers(
      90,
      25,
      parseClickHouseScope({ sensorIds: 'sensor-a,sensor-b' }),
    )

    const options = query.mock.calls[0]?.[0]
    expect(options.query).toContain("'cowrie' AS source")
    expect(options.query).toContain("'web' AS source")
    expect(options.query).toContain('protocol AS source')
    expect(options.query).toContain("'suricata' AS source")
    expect(options.query).toContain('arraySort(groupUniqArray(source)) AS sources')
    expect(options.query).toContain('AND sensor_id IN {sensorIds:Array(String)}')
    expect(options.query).toContain('LIMIT {limit:UInt16}')
    expect(options.query_params).toEqual({
      rangeDays: 90,
      limit: 25,
      sensorIds: ['sensor-a', 'sensor-b'],
    })
  })

  it('fails closed for an explicitly empty sensor scope', async () => {
    const query = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([]),
    })
    const repository = new AnalyticsRankingRepository(
      { query } as unknown as ClickHouseClient,
    )

    await repository.getTopAttackers(
      7,
      10,
      parseClickHouseScope({ sensorIds: '__none__' }),
    )

    expect(query.mock.calls[0]?.[0].query).toContain('AND false')
    expect(query.mock.calls[0]?.[0].query_params).toEqual({
      rangeDays: 7,
      limit: 10,
    })
  })
})
