import type { ClickHouseClient } from '@clickhouse/client'
import { describe, expect, it, vi } from 'vitest'
import { parseClickHouseScope } from '../../lib/clickhouse-scope.js'
import { AnalyticsAttackerService } from './analytics-attacker.service.js'

function rowsForQuery(sql: string) {
  if (sql.includes('FROM cowrie_events')) {
    return [{
      eventId: 'cowrie-1',
      timestamp: '2026-07-27 10:00:00.000',
      sensorId: 'sensor-a',
      eventType: 'cowrie.login.failed',
      username: 'root',
      input: null,
      dstPort: 22,
    }]
  }
  if (sql.includes('FROM web_events')) {
    return [{
      eventId: 'web-1',
      timestamp: '2026-07-27 12:00:00.000',
      sensorId: 'sensor-a',
      method: 'POST',
      path: '/admin',
      attackType: 'credential_attack',
      canaryTriggered: 1,
    }]
  }
  if (sql.includes('FROM protocol_events')) {
    return [{
      eventId: 'protocol-1',
      timestamp: '2026-07-27 11:00:00.000',
      sensorId: 'sensor-a',
      protocol: 'ftp',
      eventType: 'auth',
      dstPort: 21,
      username: 'admin',
    }]
  }
  return [{
    eventId: 'suricata-1',
    timestamp: '2026-07-27 09:00:00.000',
    sensorId: 'sensor-a',
    protocol: 'TCP',
    action: 'allowed',
    signature: 'Known scanner',
    category: 'Attempted Information Leak',
    severity: 2,
    destPort: 443,
  }]
}

describe('AnalyticsAttackerService', () => {
  it('merges all sources newest-first and returns a bounded page', async () => {
    const query = vi.fn().mockImplementation(async ({ query: sql }: { query: string }) => ({
      json: vi.fn().mockResolvedValue(rowsForQuery(sql)),
    }))
    const service = new AnalyticsAttackerService({ query } as unknown as ClickHouseClient)

    const page = await service.getTimeline(
      null,
      '203.0.113.10',
      3,
      undefined,
      parseClickHouseScope({ sensorIds: 'sensor-a' }),
    )

    expect(page.items.map((item) => item.source)).toEqual(['web', 'protocol', 'cowrie'])
    expect(page.items[0]?.summary).toBe('POST /admin — credential_attack (canary triggered)')
    expect(page.items[1]?.summary).toBe('FTP auth on port 21 as admin')
    expect(page.items[2]?.summary).toBe('SSH login failed as root')
    expect(page.hasMore).toBe(true)
    expect(page.nextBefore).toBe('2026-07-27 10:00:00.000')
    expect(query).toHaveBeenCalledTimes(4)
  })

  it('passes an exclusive cursor and tenant scope to every source query', async () => {
    const query = vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue([]) })
    const service = new AnalyticsAttackerService({ query } as unknown as ClickHouseClient)
    const before = '2026-07-27T12:00:00.000Z'

    await service.getTimeline(
      null,
      '2001:db8::1',
      50,
      before,
      parseClickHouseScope({ sensorIds: 'sensor-a,sensor-b' }),
    )

    for (const [options] of query.mock.calls) {
      expect(options.query).toContain('timestamp < parseDateTime64BestEffort({before:String}, 3)')
      expect(options.query).toContain('AND sensor_id IN {sensorIds:Array(String)}')
      expect(options.query_params).toEqual({
        ip: '2001:db8::1',
        limit: 50,
        before,
        sensorIds: ['sensor-a', 'sensor-b'],
      })
      expect(options.query).not.toMatch(/\b(raw|password)\b/)
    }
  })
})
