import type { ClickHouseClient } from '@clickhouse/client'
import type { PrismaClient } from '@prisma/client'
import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyticsRoutes } from './analytics.controller.js'

const apps: Array<ReturnType<typeof Fastify>> = []

async function createApp(
  clickhouse: ClickHouseClient | null,
  prismaRead = { $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as PrismaClient,
) {
  const app = Fastify()
  apps.push(app)
  app.decorate('clickhouse', clickhouse)
  app.decorate('cache', null)
  app.decorate('prismaRead', prismaRead)
  await app.register(analyticsRoutes)
  return app
}

function createClickHouse() {
  const query = vi.fn().mockResolvedValue({
    json: vi.fn().mockResolvedValue([]),
  })
  return {
    client: { query } as unknown as ClickHouseClient,
    query,
  }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('analytics routes', () => {
  it('returns 503 when ClickHouse is not configured', async () => {
    const app = await createApp(null)

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/credentials/top-combos',
    })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ error: 'analytics_unavailable' })
  })

  it('returns 400 for invalid query parameters without querying ClickHouse', async () => {
    const { client, query } = createClickHouse()
    const app = await createApp(client)

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/credentials/top-combos?range=invalid&limit=0',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('Invalid query params')
    expect(query).not.toHaveBeenCalled()
  })

  it('propagates tenant scope and returns campaign detection metadata', async () => {
    const { client, query } = createClickHouse()
    const app = await createApp(client)

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/credentials/campaigns?range=7d&limit=25&sensorIds=sensor-a,sensor-b',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      range: '7d',
      limit: 25,
      windowMinutes: 5,
      minimumAttempts: 10,
      data: [],
    })
    expect(query.mock.calls[0]?.[0].query_params).toEqual({
      rangeDays: 7,
      minimumAttempts: 10,
      limit: 25,
      sensorIds: ['sensor-a', 'sensor-b'],
    })
  })

  it('labels success-rate data as Cowrie-only', async () => {
    const { client } = createClickHouse()
    const app = await createApp(client)

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/credentials/success-rate?range=1y',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ range: '1y', source: 'cowrie', data: [] })
  })

  it('validates attacker IPs and rejects internal addresses', async () => {
    const { client, query } = createClickHouse()
    const app = await createApp(client)

    const invalid = await app.inject({
      method: 'GET',
      url: '/analytics/attacker/not-an-ip/timeline',
    })
    const internal = await app.inject({
      method: 'GET',
      url: '/analytics/attacker/10.0.0.5/timeline',
    })

    expect(invalid.statusCode).toBe(400)
    expect(internal.statusCode).toBe(404)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns a scoped, paginated attacker timeline', async () => {
    const { client, query } = createClickHouse()
    const app = await createApp(client)
    const before = '2026-07-27T12:00:00.000Z'

    const response = await app.inject({
      method: 'GET',
      url: `/analytics/attacker/203.0.113.10/timeline?limit=25&before=${encodeURIComponent(before)}&sensorIds=sensor-a`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      ip: '203.0.113.10',
      limit: 25,
      before,
      items: [],
      hasMore: false,
      nextBefore: null,
    })
    expect(query).toHaveBeenCalledTimes(4)
    for (const [options] of query.mock.calls) {
      expect(options.query_params).toMatchObject({
        ip: '203.0.113.10',
        limit: 25,
        before,
        sensorIds: ['sensor-a'],
      })
    }
  })

  it('returns scoped Suricata trends and validates grouping', async () => {
    const { client, query } = createClickHouse()
    const app = await createApp(client)

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/suricata-trends?range=90d&groupBy=category&limit=8&sensorIds=sensor-a',
    })
    const invalid = await app.inject({
      method: 'GET',
      url: '/analytics/suricata-trends?groupBy=unsafe-column',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      range: '90d',
      groupBy: 'category',
      limit: 8,
      data: [],
      top: [],
    })
    expect(query.mock.calls[0]?.[0].query_params).toEqual({
      rangeDays: 90,
      limit: 8,
      sensorIds: ['sensor-a'],
    })
    expect(invalid.statusCode).toBe(400)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('restricts comparison analytics to authenticated global superadmins', async () => {
    const previousSecret = process.env.CONTROL_API_SECRET
    process.env.CONTROL_API_SECRET = 'analytics-test-secret'
    try {
      const { client, query } = createClickHouse()
      const app = await createApp(client)
      const viewerHeaders = {
        'x-control-api-token': 'analytics-test-secret',
        'x-control-actor-id': 'viewer-1',
        'x-control-actor-role': 'viewer',
        'x-control-actor-superadmin': 'false',
        'x-control-actor-global': 'false',
        'x-control-actor-ip': '127.0.0.1',
      }

      const forbidden = await app.inject({
        method: 'GET',
        url: '/analytics/comparison',
        headers: viewerHeaders,
      })
      expect(forbidden.statusCode).toBe(403)
      expect(query).not.toHaveBeenCalled()

      const allowed = await app.inject({
        method: 'GET',
        url: '/analytics/comparison?range=7d&sensorIds=sensor-a',
        headers: {
          ...viewerHeaders,
          'x-control-actor-id': 'superadmin-1',
          'x-control-actor-role': 'superadmin',
          'x-control-actor-superadmin': 'true',
          'x-control-actor-global': 'true',
        },
      })
      expect(allowed.statusCode).toBe(200)
      expect(allowed.json()).toEqual({ range: '7d', bySensor: [], byClient: [] })
      expect(query.mock.calls[0]?.[0].query_params).toEqual({
        rangeDays: 7,
        sensorIds: ['sensor-a'],
      })
    } finally {
      if (previousSecret === undefined) delete process.env.CONTROL_API_SECRET
      else process.env.CONTROL_API_SECRET = previousSecret
    }
  })

  it('combines trends and credential intelligence for report consumers', async () => {
    const { client, query } = createClickHouse()
    const app = await createApp(client)

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/report-summary?range=30d&credentialLimit=7&sensorIds=sensor-a',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      range: '30d',
      credentialLimit: 7,
      trends: [],
      credentials: {
        top: [],
        successRate: [],
      },
    })
    expect(query).toHaveBeenCalledTimes(3)
    expect(query.mock.calls.map(([options]) => options.query_params)).toEqual([
      { rangeDays: 30, sensorIds: ['sensor-a'] },
      { rangeDays: 30, limit: 7, sensorIds: ['sensor-a'] },
      { rangeDays: 30, sensorIds: ['sensor-a'] },
    ])
  })

  it('returns scoped trends by sensor for regular analytics consumers', async () => {
    const query = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([
        { bucket: '2026-07-27 10:00:00', sensorId: 'sensor-a', count: '12' },
      ]),
    })
    const prismaRead = {
      $queryRaw: vi.fn().mockResolvedValue([
        { sensorId: 'sensor-a', sensorName: 'Primary SSH', clientId: 'client-1', clientName: 'Acme' },
      ]),
    } as unknown as PrismaClient
    const app = await createApp({ query } as unknown as ClickHouseClient, prismaRead)

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/trends/by-sensor?range=7d&sensorIds=sensor-a',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      range: '7d',
      data: [
        {
          bucket: '2026-07-27 10:00:00',
          sensorId: 'sensor-a',
          sensorName: 'Primary SSH',
          count: 12,
        },
      ],
    })
    expect(query.mock.calls[0]?.[0].query_params).toEqual({
      rangeDays: 7,
      sensorIds: ['sensor-a'],
    })
  })

  it('returns a scoped cross-source attacker ranking and validates its limit', async () => {
    const query = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([
        {
          srcIp: '203.0.113.8',
          count: '42',
          firstSeen: '2026-07-01 00:00:00',
          lastSeen: '2026-07-27 00:00:00',
          sources: ['suricata', 'cowrie'],
        },
      ]),
    })
    const app = await createApp({ query } as unknown as ClickHouseClient)

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/top-attackers?range=30d&limit=5&sensorIds=sensor-a',
    })
    const invalid = await app.inject({
      method: 'GET',
      url: '/analytics/top-attackers?limit=101',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      range: '30d',
      limit: 5,
      data: [
        {
          srcIp: '203.0.113.8',
          count: 42,
          firstSeen: '2026-07-01 00:00:00',
          lastSeen: '2026-07-27 00:00:00',
          sources: ['cowrie', 'suricata'],
        },
      ],
    })
    expect(query.mock.calls[0]?.[0].query_params).toEqual({
      rangeDays: 30,
      limit: 5,
      sensorIds: ['sensor-a'],
    })
    expect(invalid.statusCode).toBe(400)
    expect(query).toHaveBeenCalledTimes(1)
  })
})
