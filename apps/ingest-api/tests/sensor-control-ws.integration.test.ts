import { randomUUID } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import WebSocket from 'ws'
import {
  SENSOR_CONTROL_MAX_MESSAGE_BYTES,
  SENSOR_CONTROL_PROTOCOL_VERSION,
} from '../src/contracts/sensor-control/protocol.js'
import { eventBus, type LiveEvent } from '../src/lib/event-bus.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeIntegration = testDatabaseUrl ? describe : describe.skip

// Contract minimum for heartbeatIntervalSeconds is 10 — this is the fastest
// the ping/pong and dead-connection-timeout tests can run without violating
// the schema. Tests using this override have a generous vitest timeout.
const FAST_HEARTBEAT_SECONDS = 10

function waitForEvent<T extends LiveEvent['type']>(
  type: T,
  timeoutMs = 5_000,
): Promise<Extract<LiveEvent, { type: T }>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      eventBus.off(type, handler)
      reject(new Error(`timed out waiting for ${type}`))
    }, timeoutMs)
    const handler = (event: LiveEvent) => {
      clearTimeout(timer)
      eventBus.off(type, handler)
      resolve(event as Extract<LiveEvent, { type: T }>)
    }
    eventBus.on(type, handler)
  })
}

describeIntegration('sensor control websocket against a real Postgres', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let baseUrl: string
  let wsUrl: string

  const clientId = `client_${randomUUID()}`
  const sensorId = `sensor-ws-${randomUUID()}`

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
    const body = await res.json()
    return body.secret as string
  }

  function connect(secret: string): WebSocket {
    return new WebSocket(wsUrl, {
      headers: { 'X-Sensor-Id': sensorId, 'X-Sensor-Control-Secret': secret },
    })
  }

  function helloMessage(overrides: Record<string, unknown> = {}) {
    return {
      protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
      messageId: randomUUID(),
      sentAt: new Date().toISOString(),
      type: 'hello',
      sensorId,
      agentVersion: 'test-agent-1.0',
      capabilities: ['status.get'],
      configHash: null,
      ...overrides,
    }
  }

  function onceMessage(ws: WebSocket, timeoutMs = 5_000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for message')), timeoutMs)
      ws.once('message', (data: Buffer) => {
        clearTimeout(timer)
        resolve(JSON.parse(data.toString('utf8')))
      })
    })
  }

  // Command tests run with the same fast ping interval as the keepalive
  // tests (FAST_HEARTBEAT_SECONDS, set globally for this file) — a 'ping'
  // can legitimately arrive interleaved with 'command'/'hello.accepted'
  // traffic, so command-flow assertions filter by type instead of assuming
  // strict ordering of every frame.
  function onceMessageOfType(ws: WebSocket, type: string, timeoutMs = 5_000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.off('message', onData)
        reject(new Error(`timed out waiting for message of type ${type}`))
      }, timeoutMs)
      const onData = (data: Buffer) => {
        const parsed = JSON.parse(data.toString('utf8'))
        if (parsed.type !== type) return
        clearTimeout(timer)
        ws.off('message', onData)
        resolve(parsed)
      }
      ws.on('message', onData)
    })
  }

  function assertNoMessageOfType(ws: WebSocket, type: string, windowMs = 1_500): Promise<void> {
    return new Promise((resolve, reject) => {
      const onData = (data: Buffer) => {
        const parsed = JSON.parse(data.toString('utf8'))
        if (parsed.type === type) {
          clearTimeout(timer)
          ws.off('message', onData)
          reject(new Error(`unexpected message of type ${type}`))
        }
      }
      const timer = setTimeout(() => {
        ws.off('message', onData)
        resolve()
      }, windowMs)
      ws.on('message', onData)
    })
  }

  async function queueStatusGetCommand(overrides: { idempotencyKey?: string } = {}): Promise<string> {
    const res = await fetch(`${baseUrl}/sensors/${sensorId}/commands`, {
      method: 'POST',
      headers: {
        'X-Control-Api-Token': process.env.CONTROL_API_SECRET ?? 'test-control-secret',
        'X-Control-Actor-Id': 'operator-1',
        'X-Control-Actor-Role': 'analyst',
        'X-Control-Actor-Client-Id': clientId,
        'X-Control-Actor-Superadmin': 'false',
        'X-Control-Actor-Ip': '127.0.0.1',
        'Idempotency-Key': overrides.idempotencyKey ?? randomUUID(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'status.get', payload: {} }),
    })
    expect([200, 201]).toContain(res.status)
    const body = await res.json()
    return body.command.id as string
  }

  async function fetchCommandStatus(commandId: string): Promise<string> {
    const res = await fetch(`${baseUrl}/sensors/${sensorId}/commands?limit=50`, {
      headers: {
        'X-Control-Api-Token': process.env.CONTROL_API_SECRET ?? 'test-control-secret',
        'X-Control-Actor-Id': 'operator-1',
        'X-Control-Actor-Role': 'viewer',
        'X-Control-Actor-Client-Id': clientId,
        'X-Control-Actor-Superadmin': 'false',
        'X-Control-Actor-Ip': '127.0.0.1',
      },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    const command = (body.commands as Array<{ id: string; status: string }>).find(c => c.id === commandId)
    if (!command) throw new Error(`command ${commandId} not found in list`)
    return command.status
  }

  function commandAckMessage(commandId: string, overrides: Record<string, unknown> = {}) {
    return {
      protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
      messageId: randomUUID(),
      sentAt: new Date().toISOString(),
      type: 'command.ack',
      commandId,
      sensorId,
      accepted: true,
      ...overrides,
    }
  }

  function commandRunningMessage(commandId: string) {
    return {
      protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
      messageId: randomUUID(),
      sentAt: new Date().toISOString(),
      type: 'command.running',
      commandId,
      sensorId,
    }
  }

  function commandResultSucceededMessage(commandId: string) {
    return {
      protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
      messageId: randomUUID(),
      sentAt: new Date().toISOString(),
      type: 'command.result',
      commandId,
      sensorId,
      status: 'succeeded',
      result: {
        agentVersion: 'test-agent-1.0',
        uptimeSeconds: 42,
        pid: 1234,
        ports: [22],
        configHash: null,
      },
    }
  }

  function onceClose(ws: WebSocket): Promise<{ code: number }> {
    return new Promise((resolve) => {
      ws.once('close', (code: number) => resolve({ code }))
    })
  }

  function onceOpen(ws: WebSocket): Promise<void> {
    return new Promise((resolve) => ws.once('open', () => resolve()))
  }

  beforeAll(async () => {
    process.env.CONTROL_API_SECRET = process.env.CONTROL_API_SECRET ?? 'test-control-secret'
    process.env.SENSOR_CONTROL_CREDENTIAL_PEPPER = process.env.SENSOR_CONTROL_CREDENTIAL_PEPPER ?? 'test-pepper'
    process.env.INGEST_SHARED_SECRET = process.env.INGEST_SHARED_SECRET ?? 'test-ingest-secret'
    // Read once at plugin module load below — set before the dynamic import so
    // the whole file runs with a fast heartbeat (contract minimum is 10s).
    process.env.SENSOR_CONTROL_HEARTBEAT_INTERVAL_SECONDS = String(FAST_HEARTBEAT_SECONDS)
    process.env.DATABASE_URL = testDatabaseUrl

    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } })
    await prisma.client.create({ data: { id: clientId, name: 'WS Client', slug: clientId } })
    await prisma.sensor.create({
      data: {
        sensorId,
        clientId,
        name: 'WS Sensor',
        protocol: 'ssh',
        ip: '10.0.0.9',
        lastSeen: new Date(),
      },
    })

    const { buildApp } = await import('../src/app.js')
    app = await buildApp()
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (!address || typeof address === 'string') throw new Error('failed to bind test server')
    baseUrl = `http://127.0.0.1:${address.port}`
    wsUrl = `ws://127.0.0.1:${address.port}/sensors/control/ws`
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
    eventBus.removeAllListeners('sensor.connected')
    eventBus.removeAllListeners('sensor.disconnected')
    eventBus.removeAllListeners('command.sent')
    eventBus.removeAllListeners('command.acked')
    eventBus.removeAllListeners('command.running')
    eventBus.removeAllListeners('command.result')
  })

  it('connects, authenticates, completes hello, and reports presence over SSE', async () => {
    const secret = await issueCredential()
    const connectedPromise = waitForEvent('sensor.connected')
    const ws = connect(secret)
    await onceOpen(ws)

    ws.send(JSON.stringify(helloMessage()))
    const accepted = await onceMessage(ws)
    expect(accepted.type).toBe('hello.accepted')
    expect(accepted.connectionId).toBeTruthy()
    expect(accepted.heartbeatIntervalSeconds).toBeGreaterThanOrEqual(10)

    const connected = await connectedPromise
    expect(connected.sensorId).toBe(sensorId)

    const disconnectedPromise = waitForEvent('sensor.disconnected')
    ws.close()
    const disconnected = await disconnectedPromise
    expect(disconnected.reason).toBe('client_closed')
  })

  it('rejects a connection with a wrong secret before any hello.accepted', async () => {
    await issueCredential()
    const ws = connect('not-the-real-secret')
    const closeEvent = await onceClose(ws)
    expect(closeEvent.code).toBe(4401)
  })

  it('rejects hello.sensorId mismatch', async () => {
    const secret = await issueCredential()
    const ws = connect(secret)
    await onceOpen(ws)

    ws.send(JSON.stringify(helloMessage({ sensorId: 'a-different-sensor' })))
    const rejected = await onceMessage(ws)
    expect(rejected.type).toBe('hello.rejected')
    expect((rejected.error as { code: string }).code).toBe('SENSOR_ID_MISMATCH')
  })

  it('rejects an unsupported protocol version', async () => {
    const secret = await issueCredential()
    const ws = connect(secret)
    await onceOpen(ws)

    ws.send(JSON.stringify(helloMessage({ protocolVersion: 999 })))
    const rejected = await onceMessage(ws)
    expect(rejected.type).toBe('hello.rejected')
  })

  it('closes the connection on an oversized frame without parsing it', async () => {
    const secret = await issueCredential()
    const ws = connect(secret)
    await onceOpen(ws)

    const closePromise = onceClose(ws)
    ws.send('x'.repeat(SENSOR_CONTROL_MAX_MESSAGE_BYTES + 1_000))
    const closeEvent = await closePromise
    // The ws-level maxPayload guard (registered in app.ts) rejects the frame
    // before it reaches our handler, closing with the protocol-level 1009
    // (Message Too Big). Our own byte-length check (close code 4413) is the
    // belt-and-suspenders fallback for a frame that slips past that config.
    expect(closeEvent.code).toBe(1009)
  })

  it('deterministically replaces a prior connection for the same sensor', async () => {
    const secret = await issueCredential()

    const ws1 = connect(secret)
    await onceOpen(ws1)
    ws1.send(JSON.stringify(helloMessage()))
    await onceMessage(ws1)

    const ws1ClosePromise = onceClose(ws1)
    const ws2 = connect(secret)
    await onceOpen(ws2)
    ws2.send(JSON.stringify(helloMessage()))
    await onceMessage(ws2)

    const ws1Close = await ws1ClosePromise
    expect(ws1Close.code).toBe(4000)
    ws2.close()
  })

  it('keeps the connection alive across ping/pong and times out without a pong', async () => {
    const secret = await issueCredential()
    const ws = connect(secret)
    await onceOpen(ws)
    ws.send(JSON.stringify(helloMessage()))
    await onceMessage(ws)

    const ping = await onceMessage(ws, (FAST_HEARTBEAT_SECONDS + 5) * 1000)
    expect(ping.type).toBe('ping')
    ws.send(JSON.stringify({
      protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
      messageId: randomUUID(),
      sentAt: new Date().toISOString(),
      type: 'pong',
      pingMessageId: ping.messageId,
    }))

    const closePromise = onceClose(ws)
    const raced = await Promise.race([
      closePromise.then(() => 'closed' as const),
      new Promise((resolve) => setTimeout(() => resolve('alive' as const), (FAST_HEARTBEAT_SECONDS + 2) * 1000)),
    ])
    expect(raced).toBe('alive')
    ws.close()
  }, 30_000)

  it('times out a connection that never responds to ping', async () => {
    const secret = await issueCredential()
    const disconnectedPromise = waitForEvent('sensor.disconnected', 30_000)
    const ws = connect(secret)
    await onceOpen(ws)
    ws.send(JSON.stringify(helloMessage()))
    await onceMessage(ws)
    await onceMessage(ws, (FAST_HEARTBEAT_SECONDS + 5) * 1000) // the ping — deliberately never answered

    const disconnected = await disconnectedPromise
    expect(disconnected.reason).toBe('connection_timeout')
  }, 30_000)

  it('delivers a command to an already-connected sensor and completes the full ack -> running -> result cycle', async () => {
    const secret = await issueCredential()
    const ws = connect(secret)
    await onceOpen(ws)
    ws.send(JSON.stringify(helloMessage()))
    await onceMessage(ws)

    const sentPromise = waitForEvent('command.sent')
    const commandMsgPromise = onceMessageOfType(ws, 'command')
    const commandId = await queueStatusGetCommand()

    const sentEvent = await sentPromise
    expect(sentEvent.commandId).toBe(commandId)
    const commandMsg = await commandMsgPromise
    expect(commandMsg.commandId).toBe(commandId)
    expect(commandMsg.action).toBe('status.get')
    expect(await fetchCommandStatus(commandId)).toBe('sent')

    const ackedPromise = waitForEvent('command.acked')
    ws.send(JSON.stringify(commandAckMessage(commandId)))
    const ackedEvent = await ackedPromise
    expect(ackedEvent.accepted).toBe(true)
    expect(await fetchCommandStatus(commandId)).toBe('acked')

    const runningPromise = waitForEvent('command.running')
    ws.send(JSON.stringify(commandRunningMessage(commandId)))
    await runningPromise
    expect(await fetchCommandStatus(commandId)).toBe('running')

    const resultPromise = waitForEvent('command.result')
    ws.send(JSON.stringify(commandResultSucceededMessage(commandId)))
    const resultEvent = await resultPromise
    expect(resultEvent.status).toBe('succeeded')
    expect(await fetchCommandStatus(commandId)).toBe('succeeded')

    ws.close()
  })

  it('delivers a command that was queued while the sensor was offline, once it connects', async () => {
    const commandId = await queueStatusGetCommand()
    expect(await fetchCommandStatus(commandId)).toBe('queued')

    const secret = await issueCredential()
    const ws = connect(secret)
    await onceOpen(ws)
    const commandMsgPromise = onceMessageOfType(ws, 'command')
    ws.send(JSON.stringify(helloMessage()))
    await onceMessage(ws) // hello.accepted

    const commandMsg = await commandMsgPromise
    expect(commandMsg.commandId).toBe(commandId)
    expect(await fetchCommandStatus(commandId)).toBe('sent')

    ws.close()
  })

  it('rejection: a command.ack with accepted false moves the command straight to failed', async () => {
    const secret = await issueCredential()
    const ws = connect(secret)
    await onceOpen(ws)
    ws.send(JSON.stringify(helloMessage()))
    await onceMessage(ws)

    const commandMsgPromise = onceMessageOfType(ws, 'command')
    const commandId = await queueStatusGetCommand()
    await commandMsgPromise

    const ackedPromise = waitForEvent('command.acked')
    ws.send(JSON.stringify(commandAckMessage(commandId, {
      accepted: false,
      error: { code: 'AGENT_BUSY', message: 'already running another command', retryable: true },
    })))
    const ackedEvent = await ackedPromise
    expect(ackedEvent.accepted).toBe(false)
    expect(await fetchCommandStatus(commandId)).toBe('failed')

    // No command.result should ever fire for this path — nothing was sent.
    await expect(waitForEvent('command.result', 1_000)).rejects.toThrow()

    ws.close()
  })

  it('timeout: a command never acked eventually expires once its TTL elapses', async () => {
    const secret = await issueCredential()
    const ws = connect(secret)
    await onceOpen(ws)
    ws.send(JSON.stringify(helloMessage()))
    await onceMessage(ws)

    const commandMsgPromise = onceMessageOfType(ws, 'command')
    const commandId = await queueStatusGetCommand()
    await commandMsgPromise
    expect(await fetchCommandStatus(commandId)).toBe('sent')

    await prisma.sensorCommand.update({
      where: { id: commandId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    })

    // Any service call that runs expireQueued() first will sweep it.
    expect(await fetchCommandStatus(commandId)).toBe('expired')

    ws.close()
  })

  it('duplicate result: a repeated command.result after success is a no-op, not a double transition', async () => {
    const secret = await issueCredential()
    const ws = connect(secret)
    await onceOpen(ws)
    ws.send(JSON.stringify(helloMessage()))
    await onceMessage(ws)

    const commandMsgPromise = onceMessageOfType(ws, 'command')
    const commandId = await queueStatusGetCommand()
    await commandMsgPromise

    ws.send(JSON.stringify(commandAckMessage(commandId)))
    await waitForEvent('command.acked')
    ws.send(JSON.stringify(commandRunningMessage(commandId)))
    await waitForEvent('command.running')

    const firstResultPromise = waitForEvent('command.result')
    ws.send(JSON.stringify(commandResultSucceededMessage(commandId)))
    await firstResultPromise
    expect(await fetchCommandStatus(commandId)).toBe('succeeded')

    const eventCountBefore = await prisma.sensorCommandEvent.count({ where: { commandId } })

    // A second, identical result must not fire a second SSE event or write a
    // second audit row — markResult's CAS fails because the command is no
    // longer in a transitionable state.
    await expect(waitForEvent('command.result', 1_000)).rejects.toThrow()
    ws.send(JSON.stringify(commandResultSucceededMessage(commandId)))
    await new Promise(resolve => setTimeout(resolve, 500))

    const eventCountAfter = await prisma.sensorCommandEvent.count({ where: { commandId } })
    expect(eventCountAfter).toBe(eventCountBefore)
    expect(await fetchCommandStatus(commandId)).toBe('succeeded')

    ws.close()
  })

  it('reconnection: a command stuck acked after a disconnect is not redelivered and resolves via TTL', async () => {
    const secret = await issueCredential()
    const ws1 = connect(secret)
    await onceOpen(ws1)
    ws1.send(JSON.stringify(helloMessage()))
    await onceMessage(ws1)

    const commandMsgPromise = onceMessageOfType(ws1, 'command')
    const commandId = await queueStatusGetCommand()
    await commandMsgPromise

    ws1.send(JSON.stringify(commandAckMessage(commandId)))
    await waitForEvent('command.acked')
    expect(await fetchCommandStatus(commandId)).toBe('acked')

    const ws1ClosePromise = onceClose(ws1)
    ws1.close()
    await ws1ClosePromise

    const ws2 = connect(secret)
    await onceOpen(ws2)
    ws2.send(JSON.stringify(helloMessage()))
    await onceMessage(ws2) // hello.accepted

    // The stuck 'acked' command must NOT be re-delivered — findDeliverable
    // only selects 'queued' rows.
    await assertNoMessageOfType(ws2, 'command', 1_500)
    expect(await fetchCommandStatus(commandId)).toBe('acked')

    await prisma.sensorCommand.update({
      where: { id: commandId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    })
    expect(await fetchCommandStatus(commandId)).toBe('expired')

    ws2.close()
  })

  it('an already-expired command is never delivered even when the sensor connects', async () => {
    const commandId = await queueStatusGetCommand()
    await prisma.sensorCommand.update({
      where: { id: commandId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    })

    const secret = await issueCredential()
    const ws = connect(secret)
    await onceOpen(ws)
    ws.send(JSON.stringify(helloMessage()))
    await onceMessage(ws) // hello.accepted

    await assertNoMessageOfType(ws, 'command', 1_500)

    ws.close()
  })

  // Rebanada 8h: a freshly-installed sensor trades the already-baked-in
  // INGEST_SHARED_SECRET for its own control credential on first boot,
  // without an admin issuing one by hand.
  describe('auto-enrollment (POST /sensors/control/enroll)', () => {
    async function enroll(id: string, token = process.env.INGEST_SHARED_SECRET ?? '') {
      return fetch(`${baseUrl}/sensors/control/enroll`, {
        method: 'POST',
        headers: { 'X-Ingest-Token': token, 'X-Sensor-Id': id },
      })
    }

    it('emits a working credential for an existing sensor', async () => {
      const res = await enroll(sensorId)
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.sensorId).toBe(sensorId)
      expect(typeof body.secret).toBe('string')

      const ws = connect(body.secret)
      await onceOpen(ws)
      ws.send(JSON.stringify(helloMessage()))
      const accepted = await onceMessage(ws)
      expect(accepted.type).toBe('hello.accepted')
      ws.close()
    })

    it('rotates on a second enroll, invalidating the previous credential', async () => {
      const first = await (await enroll(sensorId)).json()
      const second = await (await enroll(sensorId)).json()
      expect(second.secret).not.toBe(first.secret)

      const oldWs = connect(first.secret)
      const closeEvent = await onceClose(oldWs)
      expect(closeEvent.code).toBe(4401)

      const newWs = connect(second.secret)
      await onceOpen(newWs)
      newWs.send(JSON.stringify(helloMessage()))
      const accepted = await onceMessage(newWs)
      expect(accepted.type).toBe('hello.accepted')
      newWs.close()
    })

    it('404s for a sensorId with no sensor row yet', async () => {
      const res = await enroll(`sensor-never-created-${randomUUID()}`)
      expect(res.status).toBe(404)
    })

    it('401s with an invalid ingest token', async () => {
      const res = await enroll(sensorId, 'wrong-token')
      expect(res.status).toBe(401)
    })
  })
})
