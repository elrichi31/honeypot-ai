import type { ClickHouseClient } from '@clickhouse/client'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { parseClickHouseScope } from '../../lib/clickhouse-scope.js'
import { AnalyticsComparisonService } from './analytics-comparison.service.js'

describe('AnalyticsComparisonService', () => {
  it('maps sensor aggregates to clients and builds a client series in memory', async () => {
    const query = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([
        { bucket: '2026-07-01 00:00:00', sensorId: 'sensor-a', count: '4' },
        { bucket: '2026-07-01 00:00:00', sensorId: 'sensor-b', count: '6' },
        { bucket: '2026-07-01 00:00:00', sensorId: 'orphan', count: '2' },
      ]),
    })
    const prismaRead = {
      $queryRaw: vi.fn().mockResolvedValue([
        { sensorId: 'sensor-a', sensorName: 'SSH A', clientId: 'client-1', clientName: 'Acme' },
        { sensorId: 'sensor-b', sensorName: 'Web B', clientId: 'client-1', clientName: 'Acme' },
      ]),
    } as unknown as PrismaClient
    const service = new AnalyticsComparisonService(
      { query } as unknown as ClickHouseClient,
      prismaRead,
    )

    const result = await service.getComparison(
      null,
      '30d',
      parseClickHouseScope({ sensorIds: 'sensor-a,sensor-b,orphan' }),
    )

    expect(result.bySensor).toEqual([
      {
        bucket: '2026-07-01 00:00:00',
        sensorId: 'sensor-a',
        sensorName: 'SSH A',
        clientId: 'client-1',
        clientName: 'Acme',
        count: 4,
      },
      {
        bucket: '2026-07-01 00:00:00',
        sensorId: 'sensor-b',
        sensorName: 'Web B',
        clientId: 'client-1',
        clientName: 'Acme',
        count: 6,
      },
      {
        bucket: '2026-07-01 00:00:00',
        sensorId: 'orphan',
        sensorName: 'orphan',
        clientId: null,
        clientName: null,
        count: 2,
      },
    ])
    expect(result.byClient).toEqual([
      {
        bucket: '2026-07-01 00:00:00',
        clientId: 'client-1',
        clientName: 'Acme',
        count: 10,
      },
      {
        bucket: '2026-07-01 00:00:00',
        clientId: null,
        clientName: 'Unassigned',
        count: 2,
      },
    ])
    expect(query.mock.calls[0]?.[0].query_params).toEqual({
      rangeDays: 30,
      sensorIds: ['sensor-a', 'sensor-b', 'orphan'],
    })
  })

  it('returns tenant-scoped sensor trends without exposing client metadata', async () => {
    const query = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([
        { bucket: '2026-07-01 00:00:00', sensorId: 'sensor-a', count: '9' },
        { bucket: '2026-07-01 00:00:00', sensorId: 'orphan', count: '2' },
      ]),
    })
    const prismaRead = {
      $queryRaw: vi.fn().mockResolvedValue([
        { sensorId: 'sensor-a', sensorName: 'SSH A', clientId: 'client-1', clientName: 'Acme' },
      ]),
    } as unknown as PrismaClient
    const service = new AnalyticsComparisonService(
      { query } as unknown as ClickHouseClient,
      prismaRead,
    )

    const result = await service.getScopedSensorTrends(
      null,
      '7d',
      parseClickHouseScope({ sensorIds: 'sensor-a,orphan' }),
    )

    expect(result).toEqual([
      {
        bucket: '2026-07-01 00:00:00',
        sensorId: 'sensor-a',
        sensorName: 'SSH A',
        count: 9,
      },
      {
        bucket: '2026-07-01 00:00:00',
        sensorId: 'orphan',
        sensorName: 'orphan',
        count: 2,
      },
    ])
    expect(result[0]).not.toHaveProperty('clientId')
    expect(query.mock.calls[0]?.[0].query_params).toEqual({
      rangeDays: 7,
      sensorIds: ['sensor-a', 'orphan'],
    })
  })
})
