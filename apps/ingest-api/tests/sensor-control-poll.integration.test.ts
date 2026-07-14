import { randomUUID } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { eventBus } from '../src/lib/event-bus.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeIntegration = testDatabaseUrl ? describe : describe.skip

// HTTP fallback poll/report (Rebanada 6) against a real app + Postgres — the
// path a sensor uses when its WS connection is down. Exercises the same
// claimDeliverable/routeClientMessage the WS plugin shares, just reached over
// plain HTTP instead of a socket.
describeIntegration('sensor control HTTP fallback poll against a real Postgres', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let baseUrl: string

  const clientId = `client_${randomUUID()}`
  const sensorId = `sensor-poll-${randomUUID()}`

  async function issueCredential(): Promise<string> {
    const res = await fetch(`${baseUrl}/sensors/${sensorId}/control-credential`, {
      method: 'POST',
      headers: {
        'X-Control-Api-Token': process.env.CONTROL_API_SECRET ?? 'test-control-secret',
        'X-Control-Actor-Id': 'operator-1',
        'X-Control-Actor-Role': 'admin',
        'X-Control-Actor-Client-Id': clientId,
        'X-Control-Actor-Superadmin': 'false',
        'X-Control-Actor-Ip': '127.0.0.1',
      },
    })
    expect(res.status).toBe(201)
    return (await res.json()).secret as string
  }

  async function queueStatusGet(): Promise<string> {
    const res = await fetch(`${baseUrl}/sensors/${sensorId}/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Control-Api-Token': process.env.CONTROL_API_SECRET ?? 'test-control-secret',
        'X-Control-Actor-Id': 'operator-1',
        'X-Control-Actor-Role': 'admin',
        'X-Control-Actor-Client-Id': clientId,
        'X-Control-Actor-Superadmin': 'false',
        'X-Control-Actor-Ip': '127.0.0.1',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({ action: 'status.get', payload: {} }),
    })
    expect(res.status).toBe(201)
    return (await res.json()).command.id as string
  }

  function poll(secret: string) {
    return fetch(`${baseUrl}/sensors/control/poll`, {
      headers: { 'X-Sensor-Id': sensorId, 'X-Sensor-Control-Secret': secret },
    })
  }

  function report(secret: string, body: Record<string, unknown>) {
    return fetch(`${baseUrl}/sensors/control/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sensor-Id': sensorId,
        'X-Sensor-Control-Secret': secret,
      },
      body: JSON.stringify(body),
    })
  }

  function envelope(type: string, extra: Record<string, unknown>) {
    return {
      protocolVersion: 1,
      messageId: randomUUID(),
      sentAt: new Date().toISOString(),
      type,
      sensorId,
      ...extra,
    }
  }

  beforeAll(async () => {
    process.env.CONTROL_API_SECRET = process.env.CONTROL_API_SECRET ?? 'test-control-secret'
    process.env.SENSOR_CONTROL_CREDENTIAL_PEPPER = process.env.SENSOR_CONTROL_CREDENTIAL_PEPPER ?? 'test-pepper'
    process.env.DATABASE_URL = testDatabaseUrl

    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } })
    await prisma.client.create({ data: { id: clientId, name: 'Poll Client', slug: clientId } })
    await prisma.sensor.create({
      data: { sensorId, clientId, name: 'Poll Sensor', protocol: 'ssh', ip: '10.0.0.10', lastSeen: new Date() },
    })

    const { buildApp } = await import('../src/app.js')
    app = await buildApp()
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (!address || typeof address === 'string') throw new Error('failed to bind test server')
    baseUrl = `http://127.0.0.1:${address.port}`
  }, 30_000)

  afterAll(async () => {
    await app.close()
    await prisma.sensorCommandEvent.deleteMany({ where: { command: { sensorId } } })
    await prisma.sensorCommand.deleteMany({ where: { sensorId } })
    await prisma.sensorControlCredential.deleteMany({ where: { sensorId } })
    await prisma.sensor.deleteMany({ where: { sensorId } })
    await prisma.client.deleteMany({ where: { id: clientId } })
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.sensorCommandEvent.deleteMany({ where: { command: { sensorId } } })
    await prisma.sensorCommand.deleteMany({ where: { sensorId } })
  })

  afterEach(async () => {
    eventBus.removeAllListeners('command.sent')
    eventBus.removeAllListeners('command.acked')
    eventBus.removeAllListeners('command.running')
    eventBus.removeAllListeners('command.result')
  })

  it('rejects poll and report without valid sensor credentials', async () => {
    expect((await poll('wrong-secret')).status).toBe(401)
    expect((await report('wrong-secret', envelope('command.ack', { commandId: 'x', accepted: true }))).status).toBe(401)
  })

  it('poll returns nothing when no command is queued', async () => {
    const secret = await issueCredential()
    const res = await poll(secret)
    expect(res.status).toBe(200)
    expect((await res.json()).commands).toEqual([])
  })

  it('claims a queued command exactly once — a second poll gets nothing (the CAS lease)', async () => {
    const secret = await issueCredential()
    const commandId = await queueStatusGet()

    const first = await poll(secret)
    const firstBody = await first.json()
    expect(firstBody.commands).toHaveLength(1)
    expect(firstBody.commands[0].commandId).toBe(commandId)

    const second = await poll(secret)
    expect((await second.json()).commands).toEqual([])

    const status = await prisma.sensorCommand.findUniqueOrThrow({ where: { id: commandId } })
    expect(status.status).toBe('sent')
  })

  it('completes ack -> running -> result entirely over HTTP, same as the WS path', async () => {
    const secret = await issueCredential()
    const commandId = await queueStatusGet()
    await poll(secret) // claims it (queued -> sent)

    expect((await report(secret, envelope('command.ack', { commandId, accepted: true }))).status).toBe(204)
    expect((await report(secret, envelope('command.running', { commandId }))).status).toBe(204)
    expect((await report(secret, envelope('command.result', {
      commandId,
      status: 'succeeded',
      result: { agentVersion: 'test-agent-1.0', uptimeSeconds: 1, ports: [22], configHash: null },
    }))).status).toBe(204)

    const final = await prisma.sensorCommand.findUniqueOrThrow({ where: { id: commandId } })
    expect(final.status).toBe('succeeded')
  })

  it('rejects a report body of an unsupported message type', async () => {
    const secret = await issueCredential()
    const res = await report(secret, envelope('hello', {
      agentVersion: '1.0', capabilities: ['status.get'], configHash: null,
    }))
    expect(res.status).toBe(400)
  })
})
