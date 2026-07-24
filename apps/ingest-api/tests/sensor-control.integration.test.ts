import { randomUUID } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sensorConnectionRegistry } from '../src/modules/sensor-control/sensor-connection-registry.js'
import { SensorControlService, type ControlActor } from '../src/modules/sensor-control/sensor-control.service.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL

const describeIntegration = testDatabaseUrl ? describe : describe.skip

describeIntegration('sensor control against a real Postgres', () => {
  let prisma: PrismaClient
  let svc: SensorControlService

  const clientAId = `client_a_${randomUUID()}`
  const clientBId = `client_b_${randomUUID()}`
  const sensorAId = `sensor-a-${randomUUID()}`
  const sensorBId = `sensor-b-${randomUUID()}`

  const actorA = (overrides: Partial<ControlActor> = {}): ControlActor => ({
    id: 'operator-a',
    role: 'analyst',
    clientId: clientAId,
    isSuperadmin: false,
    isGlobal: false,
    ip: '127.0.0.1',
    ...overrides,
  })

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } })
    svc = new SensorControlService(prisma, sensorConnectionRegistry)

    await prisma.client.create({ data: { id: clientAId, name: 'Client A', slug: clientAId } })
    await prisma.client.create({ data: { id: clientBId, name: 'Client B', slug: clientBId } })
    await prisma.sensor.create({
      data: {
        sensorId: sensorAId,
        clientId: clientAId,
        name: 'Sensor A',
        protocol: 'ssh',
        ip: '10.0.0.1',
        lastSeen: new Date(),
      },
    })
    await prisma.sensor.create({
      data: {
        sensorId: sensorBId,
        clientId: clientBId,
        name: 'Sensor B',
        protocol: 'ssh',
        ip: '10.0.0.2',
        lastSeen: new Date(),
      },
    })
  })

  afterAll(async () => {
    await prisma.sensorCommandEvent.deleteMany({ where: { command: { sensorId: { in: [sensorAId, sensorBId] } } } })
    await prisma.sensorCommand.deleteMany({ where: { sensorId: { in: [sensorAId, sensorBId] } } })
    await prisma.sensor.deleteMany({ where: { sensorId: { in: [sensorAId, sensorBId] } } })
    await prisma.client.deleteMany({ where: { id: { in: [clientAId, clientBId] } } })
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.sensorCommandEvent.deleteMany({ where: { command: { sensorId: { in: [sensorAId, sensorBId] } } } })
    await prisma.sensorCommand.deleteMany({ where: { sensorId: { in: [sensorAId, sensorBId] } } })
  })

  it('creates a queued command and records a queued event', async () => {
    const result = await svc.queueStatusGet({ sensorId: sensorAId, idempotencyKey: randomUUID(), actor: actorA() })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.replayed).toBe(false)
    expect(result.value.command.status).toBe('queued')

    const events = await prisma.sensorCommandEvent.findMany({ where: { commandId: result.value.command.id } })
    expect(events).toHaveLength(1)
    expect(events[0]?.status).toBe('queued')
    expect(events[0]?.actorId).toBe('operator-a')
  })

  it('replays the same command when the idempotency key repeats', async () => {
    const idempotencyKey = randomUUID()
    const first = await svc.queueStatusGet({ sensorId: sensorAId, idempotencyKey, actor: actorA() })
    const second = await svc.queueStatusGet({ sensorId: sensorAId, idempotencyKey, actor: actorA() })

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.value.replayed).toBe(true)
    expect(second.value.command.id).toBe(first.value.command.id)

    const commands = await prisma.sensorCommand.findMany({ where: { sensorId: sensorAId } })
    expect(commands).toHaveLength(1)
  })

  it('rejects an actor scoped to a different client', async () => {
    const result = await svc.queueStatusGet({
      sensorId: sensorAId,
      idempotencyKey: randomUUID(),
      actor: actorA({ clientId: clientBId }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
  })

  it('rejects a viewer trying to queue a command', async () => {
    const result = await svc.queueStatusGet({
      sensorId: sensorAId,
      idempotencyKey: randomUUID(),
      actor: actorA({ role: 'viewer' }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
  })

  it('returns 404 for a sensor that does not exist', async () => {
    const result = await svc.queueStatusGet({
      sensorId: `missing-${randomUUID()}`,
      idempotencyKey: randomUUID(),
      actor: actorA(),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(404)
  })

  it('lists commands scoped to the sensor only, newest first', async () => {
    const first = await svc.queueStatusGet({ sensorId: sensorAId, idempotencyKey: randomUUID(), actor: actorA() })
    await new Promise(resolve => setTimeout(resolve, 5))
    const second = await svc.queueStatusGet({ sensorId: sensorAId, idempotencyKey: randomUUID(), actor: actorA() })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    const listed = await svc.listCommands({ sensorId: sensorAId, limit: 20, actor: actorA() })
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.value.commands.map(c => c.id)).toEqual([second.value.command.id, first.value.command.id])
  })

  it('cancels a queued command and records a cancelled event', async () => {
    const created = await svc.queueStatusGet({ sensorId: sensorAId, idempotencyKey: randomUUID(), actor: actorA() })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const cancelled = await svc.cancelCommand({
      sensorId: sensorAId,
      commandId: created.value.command.id,
      actor: actorA(),
    })
    expect(cancelled.ok).toBe(true)
    if (!cancelled.ok) return
    expect(cancelled.value.command.status).toBe('cancelled')

    const events = await prisma.sensorCommandEvent.findMany({
      where: { commandId: created.value.command.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(events.map(e => e.status)).toEqual(['queued', 'cancelled'])
  })

  it('rejects cancelling a command twice', async () => {
    const created = await svc.queueStatusGet({ sensorId: sensorAId, idempotencyKey: randomUUID(), actor: actorA() })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    await svc.cancelCommand({ sensorId: sensorAId, commandId: created.value.command.id, actor: actorA() })
    const second = await svc.cancelCommand({ sensorId: sensorAId, commandId: created.value.command.id, actor: actorA() })

    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.status).toBe(409)
  })

  it('returns 404 when cancelling a command for the wrong sensor', async () => {
    const created = await svc.queueStatusGet({ sensorId: sensorAId, idempotencyKey: randomUUID(), actor: actorA() })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const result = await svc.cancelCommand({
      sensorId: sensorBId,
      commandId: created.value.command.id,
      actor: actorA({ clientId: clientBId }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(404)
  })

  it('expires a queued command past its TTL and records an expired event', async () => {
    const command = await prisma.sensorCommand.create({
      data: {
        id: `cmd_${randomUUID()}`,
        sensorId: sensorAId,
        action: 'status.get',
        payload: {},
        status: 'queued',
        requestedBy: 'operator-a',
        requestedIp: '127.0.0.1',
        idempotencyKey: randomUUID(),
        expiresAt: new Date(Date.now() - 1_000),
      },
    })

    const listed = await svc.listCommands({ sensorId: sensorAId, limit: 20, actor: actorA() })
    expect(listed.ok).toBe(true)
    if (!listed.ok) return

    const expired = listed.value.commands.find(c => c.id === command.id)
    expect(expired?.status).toBe('expired')

    const events = await prisma.sensorCommandEvent.findMany({ where: { commandId: command.id } })
    expect(events.some(e => e.status === 'expired' && e.actorType === 'system')).toBe(true)
  })

  it('lets a superadmin act across clients without an explicit clientId', async () => {
    const result = await svc.queueStatusGet({
      sensorId: sensorBId,
      idempotencyKey: randomUUID(),
      actor: actorA({ role: 'admin', clientId: null, isSuperadmin: true, isGlobal: true }),
    })
    expect(result.ok).toBe(true)
  })
})
