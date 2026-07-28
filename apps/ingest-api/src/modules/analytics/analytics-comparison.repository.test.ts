import type { ClickHouseClient } from '@clickhouse/client'
import { describe, expect, it, vi } from 'vitest'
import { parseClickHouseScope } from '../../lib/clickhouse-scope.js'
import { AnalyticsComparisonRepository } from './analytics-comparison.repository.js'

describe('AnalyticsComparisonRepository', () => {
  it('groups all lake sources by safe bucket and tenant-scoped sensor', async () => {
    const query = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([]),
    })
    const repository = new AnalyticsComparisonRepository(
      { query } as unknown as ClickHouseClient,
    )

    await repository.getSensorTrends(
      7,
      'hour',
      parseClickHouseScope({ sensorIds: 'sensor-a' }),
    )

    const options = query.mock.calls[0]?.[0]
    expect(options.query).toContain('toStartOfHour(timestamp)')
    expect(options.query).toContain('FROM cowrie_events')
    expect(options.query).toContain('FROM web_events')
    expect(options.query).toContain('FROM protocol_events')
    expect(options.query).toContain('FROM suricata_alerts')
    expect(options.query).toContain('GROUP BY bucket, sensorId')
    expect(options.query).toContain('AND sensor_id IN {sensorIds:Array(String)}')
    expect(options.query_params).toEqual({
      rangeDays: 7,
      sensorIds: ['sensor-a'],
    })
  })
})
