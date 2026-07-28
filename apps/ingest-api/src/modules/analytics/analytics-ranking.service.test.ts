import type { ClickHouseClient } from '@clickhouse/client'
import { describe, expect, it, vi } from 'vitest'
import { parseClickHouseScope } from '../../lib/clickhouse-scope.js'
import { AnalyticsRankingService } from './analytics-ranking.service.js'

describe('AnalyticsRankingService', () => {
  it('normalizes ClickHouse counts and source ordering', async () => {
    const query = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([
        {
          srcIp: '203.0.113.8',
          count: '42',
          firstSeen: '2026-07-01 00:00:00',
          lastSeen: '2026-07-27 00:00:00',
          sources: ['suricata', 'cowrie', 'http'],
        },
      ]),
    })
    const service = new AnalyticsRankingService(
      { query } as unknown as ClickHouseClient,
    )

    const result = await service.getTopAttackers(
      null,
      '30d',
      20,
      parseClickHouseScope({ sensorIds: 'sensor-a' }),
    )

    expect(result).toEqual([
      {
        srcIp: '203.0.113.8',
        count: 42,
        firstSeen: '2026-07-01 00:00:00',
        lastSeen: '2026-07-27 00:00:00',
        sources: ['cowrie', 'http', 'suricata'],
      },
    ])
  })
})
