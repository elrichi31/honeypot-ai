import type { ClickHouseClient } from '@clickhouse/client'
import { describe, expect, it, vi } from 'vitest'
import { parseClickHouseScope } from '../../lib/clickhouse-scope.js'
import { AnalyticsSuricataService } from './analytics-suricata.service.js'

describe('AnalyticsSuricataService', () => {
  it('uses the selected safe group column, adaptive bucket and tenant scope', async () => {
    const query = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([
        { bucket: '2026-07-06 00:00:00', name: 'Recon', count: '2', severity: '3' },
        { bucket: '2026-07-13 00:00:00', name: 'Recon', count: '3', severity: '2' },
        { bucket: '2026-07-13 00:00:00', name: 'Malware', count: '4', severity: '1' },
      ]),
    })
    const service = new AnalyticsSuricataService({ query } as unknown as ClickHouseClient)

    const result = await service.getTrends(
      null,
      '1y',
      'category',
      10,
      parseClickHouseScope({ sensorIds: 'sensor-a,sensor-b' }),
    )

    const options = query.mock.calls[0]?.[0]
    expect(options.query).toContain('category AS name')
    expect(options.query).toContain('toStartOfWeek(timestamp)')
    expect(options.query.match(/AND sensor_id IN \{sensorIds:Array\(String\)\}/g)).toHaveLength(2)
    expect(options.query_params).toEqual({
      rangeDays: 365,
      limit: 10,
      sensorIds: ['sensor-a', 'sensor-b'],
    })
    expect(result.data[0]).toEqual({
      bucket: '2026-07-06 00:00:00',
      group: 'Recon',
      count: 2,
      severity: 3,
    })
    expect(result.top).toEqual([
      { group: 'Recon', count: 5, severity: 2 },
      { group: 'Malware', count: 4, severity: 1 },
    ])
  })

  it('uses signature grouping and hourly buckets for seven days', async () => {
    const query = vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) })
    const service = new AnalyticsSuricataService({ query } as unknown as ClickHouseClient)

    await service.getTrends(null, '7d', 'signature', 5, parseClickHouseScope({}))

    const options = query.mock.calls[0]?.[0]
    expect(options.query).toContain('signature AS name')
    expect(options.query).toContain('toStartOfHour(timestamp)')
    expect(options.query_params).toEqual({ rangeDays: 7, limit: 5 })
  })
})
