import { randomUUID } from 'crypto'
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import {
  SENSOR_CONTROL_MAX_MESSAGE_BYTES,
  SENSOR_CONTROL_PROTOCOL_VERSION,
  sensorControlClientMessageSchema,
  sensorControlHelloSchema,
  type SensorControlClientMessage,
  type SensorControlServerMessage,
} from '../../contracts/sensor-control/protocol.js'
import { eventBus } from '../../lib/event-bus.js'
import { SensorControlCredentialService } from './sensor-control-credential.service.js'
import { sensorConnectionRegistry, type SensorControlConnection } from './sensor-connection-registry.js'
import { SensorControlService } from './sensor-control.service.js'

const HEARTBEAT_INTERVAL_SECONDS = Number(process.env.SENSOR_CONTROL_HEARTBEAT_INTERVAL_SECONDS ?? '30')
const DEAD_CONNECTION_GRACE_MULTIPLIER = 2
const MAX_BUFFERED_BYTES = SENSOR_CONTROL_MAX_MESSAGE_BYTES * 4

function nowIso(): string {
  return new Date().toISOString()
}

export default fp(async (fastify: FastifyInstance) => {
  const credentialSvc = new SensorControlCredentialService(
    fastify.prisma,
    process.env.SENSOR_CONTROL_CREDENTIAL_PEPPER ?? '',
  )
  const svc = new SensorControlService(fastify.prisma, sensorConnectionRegistry)

  // Drive TTL expiry independently of operator REST traffic so a command that
  // gets stuck in a non-terminal state after a sensor disconnect still resolves
  // to 'expired'. unref() keeps this timer from holding the process open.
  const expirySweep = setInterval(() => {
    svc.sweepExpired().catch(err => fastify.log.error({ err }, 'sensor-control expiry sweep failed'))
  }, 30_000)
  expirySweep.unref()

  fastify.get('/sensors/control/ws', { websocket: true }, async (socket: WebSocket, request) => {
    // Pause the underlying socket immediately so any frame the client sends
    // while credentialSvc.verify() is pending (an await that yields) is held
    // at the TCP layer instead of being emitted as a 'message' event before
    // any listener is attached — an unlistened EventEmitter event is lost,
    // not buffered.
    socket.pause()

    const sensorId = request.headers['x-sensor-id']
    const secret = request.headers['x-sensor-control-secret']

    if (typeof sensorId !== 'string' || typeof secret !== 'string' || !sensorId || !secret) {
      socket.resume()
      socket.close(4401, 'missing_credentials')
      return
    }

    const verified = await credentialSvc.verify(sensorId, secret)
    if (!verified) {
      socket.resume()
      socket.close(4401, 'invalid_credentials')
      return
    }

    // Auth passed; from here on we may register a connection, so all
    // subsequent listeners must be wired before any await that yields.
    let registered = false
    let connectionId = ''
    let pingInterval: ReturnType<typeof setInterval> | undefined
    let lastActivityAt = Date.now()
    let lastPingMessageId: string | undefined
    let cleanedUp = false
    // The 'close' event fires whether the server or the client initiated the
    // close, with no reason info of its own — closeReason records why the
    // SERVER closed it (set right before any socket.close() call below) so
    // cleanup() can report the true cause instead of always defaulting to
    // "client_closed".
    let closeReason = 'client_closed'

    const closeWithReason = (code: number, reason: string) => {
      closeReason = reason
      socket.close(code, reason)
    }

    const send = (message: SensorControlServerMessage) => {
      if (socket.readyState !== socket.OPEN) return
      if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
        closeWithReason(4408, 'backpressure_exceeded')
        return
      }
      socket.send(JSON.stringify(message))
    }

    const cleanup = (reason: string) => {
      // 'close' and 'error' can both fire for the same socket; without this
      // guard cleanup would unregister/emit sensor.disconnected twice.
      if (cleanedUp) return
      cleanedUp = true
      if (pingInterval) clearInterval(pingInterval)
      if (registered) {
        sensorConnectionRegistry.unregister(sensorId, connectionId)
        eventBus.emit('sensor.disconnected', {
          type: 'sensor.disconnected',
          sensorId,
          connectionId,
          reason,
          timestamp: nowIso(),
        })
      }
    }

    // Each handler emits an SSE LiveEvent only when the service confirms the
    // transition actually applied (kind === 'ok') — a not_found/invalid
    // duplicate or out-of-order message is silently dropped, per the wire
    // protocol having no "ack of an ack" message.
    const handleAck = async (msg: Extract<SensorControlClientMessage, { type: 'command.ack' }>) => {
      const result = await svc.handleAck(sensorId, msg)
      if (result.kind !== 'ok') return
      eventBus.emit('command.acked', {
        type: 'command.acked',
        commandId: msg.commandId,
        sensorId,
        accepted: msg.accepted,
        timestamp: nowIso(),
      })
    }

    const handleRunning = async (msg: Extract<SensorControlClientMessage, { type: 'command.running' }>) => {
      const result = await svc.handleRunning(sensorId, msg)
      if (result.kind !== 'ok') return
      eventBus.emit('command.running', {
        type: 'command.running',
        commandId: msg.commandId,
        sensorId,
        timestamp: nowIso(),
      })
    }

    const handleResult = async (msg: Extract<SensorControlClientMessage, { type: 'command.result' }>) => {
      const result = await svc.handleResult(sensorId, msg)
      if (result.kind !== 'ok') return
      eventBus.emit('command.result', {
        type: 'command.result',
        commandId: msg.commandId,
        sensorId,
        status: msg.status,
        timestamp: nowIso(),
      })
    }

    // Control messages for a command are strictly ordered on the wire (ack
    // before running before result), but each handler runs its own DB
    // transaction; fired independently (void handleX) those transactions race,
    // and a result can read a pre-ack status and be dropped as an invalid
    // transition. Chaining onto a single per-connection promise serializes
    // them so each transition commits before the next is processed. The
    // .catch also stops a DB error in one handler from becoming an unhandled
    // rejection that could crash the shared ingest process.
    let processing: Promise<void> = Promise.resolve()
    const enqueue = (fn: () => Promise<void>) => {
      processing = processing
        .then(fn)
        .catch(err => request.log.error({ err, sensorId }, 'sensor-control message handler failed'))
    }

    socket.on('close', () => cleanup(closeReason))
    socket.on('error', () => cleanup('socket_error'))

    socket.on('message', (raw: Buffer) => {
      lastActivityAt = Date.now()

      if (Buffer.byteLength(raw as unknown as Uint8Array) > SENSOR_CONTROL_MAX_MESSAGE_BYTES) {
        closeWithReason(4413, 'message_too_large')
        return
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw.toString('utf8'))
      } catch {
        closeWithReason(4400, 'invalid_json')
        return
      }

      if (!registered) {
        const hello = sensorControlHelloSchema.safeParse(parsed)
        if (!hello.success) {
          send({
            protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
            messageId: randomUUID(),
            sentAt: nowIso(),
            type: 'hello.rejected',
            error: { code: 'INVALID_HELLO', message: 'hello message failed validation', retryable: false },
          })
          closeWithReason(4400, 'invalid_hello')
          return
        }
        if (hello.data.protocolVersion !== SENSOR_CONTROL_PROTOCOL_VERSION) {
          send({
            protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
            messageId: randomUUID(),
            sentAt: nowIso(),
            type: 'hello.rejected',
            error: { code: 'PROTOCOL_VERSION_UNSUPPORTED', message: 'unsupported protocol version', retryable: false },
          })
          closeWithReason(4400, 'protocol_version_unsupported')
          return
        }
        if (hello.data.sensorId !== sensorId) {
          send({
            protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
            messageId: randomUUID(),
            sentAt: nowIso(),
            type: 'hello.rejected',
            error: { code: 'SENSOR_ID_MISMATCH', message: 'hello.sensorId does not match the authenticated sensor', retryable: false },
          })
          closeWithReason(4401, 'sensor_id_mismatch')
          return
        }

        connectionId = randomUUID()
        const connection: SensorControlConnection = {
          sensorId,
          connectionId,
          connectedAt: new Date(),
          send,
          close: closeWithReason,
        }
        sensorConnectionRegistry.register(connection)
        registered = true

        send({
          protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
          messageId: randomUUID(),
          sentAt: nowIso(),
          type: 'hello.accepted',
          connectionId,
          heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
        })
        eventBus.emit('sensor.connected', {
          type: 'sensor.connected',
          sensorId,
          connectionId,
          agentVersion: hello.data.agentVersion,
          capabilities: hello.data.capabilities,
          timestamp: nowIso(),
        })

        // Deliver any commands already queued for this sensor now that it's
        // connected. Routed through the same serialization chain as the
        // message handlers so a fast ack for a just-delivered command is
        // always processed after this markSent commits, and so a delivery
        // error is logged rather than left as an unhandled rejection.
        enqueue(() => svc.attemptDelivery(sensorId))

        pingInterval = setInterval(() => {
          const graceMs = HEARTBEAT_INTERVAL_SECONDS * DEAD_CONNECTION_GRACE_MULTIPLIER * 1000
          if (Date.now() - lastActivityAt > graceMs) {
            closeWithReason(4408, 'connection_timeout')
            return
          }
          lastPingMessageId = randomUUID()
          send({
            protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
            messageId: lastPingMessageId,
            sentAt: nowIso(),
            type: 'ping',
          })
        }, HEARTBEAT_INTERVAL_SECONDS * 1000)
        return
      }

      const message = sensorControlClientMessageSchema.safeParse(parsed)
      if (!message.success) return

      switch (message.data.type) {
        case 'pong':
          if (message.data.pingMessageId !== lastPingMessageId) return
          break
        case 'command.ack': {
          if (message.data.sensorId !== sensorId) return
          const ack = message.data
          enqueue(() => handleAck(ack))
          break
        }
        case 'command.running': {
          if (message.data.sensorId !== sensorId) return
          const running = message.data
          enqueue(() => handleRunning(running))
          break
        }
        case 'command.result': {
          if (message.data.sensorId !== sensorId) return
          const result = message.data
          enqueue(() => handleResult(result))
          break
        }
        case 'sensor.status':
          // Still out of scope for Rebanada 3 — validated so malformed
          // traffic is observable, but not acted on yet.
          break
      }
    })

    socket.resume()
  })
}, { name: 'sensor-control-ws' })
