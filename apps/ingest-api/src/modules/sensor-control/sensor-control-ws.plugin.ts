import { randomUUID } from 'crypto'
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import {
  SENSOR_CONTROL_MAX_MESSAGE_BYTES,
  SENSOR_CONTROL_PROTOCOL_VERSION,
  sensorControlClientMessageSchema,
  sensorControlHelloSchema,
  type SensorControlServerMessage,
} from '../../contracts/sensor-control/protocol.js'
import { eventBus } from '../../lib/event-bus.js'
import { SensorControlCredentialService } from './sensor-control-credential.service.js'
import { sensorConnectionRegistry, type SensorControlConnection } from './sensor-connection-registry.js'
import { SensorControlService } from './sensor-control.service.js'
import { SensorConfigService } from '../sensors/sensor-config.service.js'

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
  const configSvc = new SensorConfigService(fastify.prisma, svc)

  // Drive TTL expiry independently of operator REST traffic so a command that
  // gets stuck in a non-terminal state after a sensor disconnect still resolves
  // to 'expired'. unref() keeps this timer from holding the process open. A
  // config.apply that expired without a confirming heartbeat is a failure
  // toward the auto-rollback threshold — see sensor-config.service.ts.
  const expirySweep = setInterval(() => {
    svc.sweepExpired()
      .then(expired => Promise.all(
        expired
          .filter(c => c.action === 'config.apply')
          .map(c => configSvc.checkAutoRollback(c.sensorId)),
      ))
      .catch(err => fastify.log.error({ err }, 'sensor-control expiry sweep failed'))
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

    // Ack/running/result all route through the same service method used by
    // the HTTP fallback poll's report endpoint (Rebanada 6) — one place for
    // state transitions, SSE emission, and the config.apply auto-rollback
    // trigger, regardless of which transport the sensor used.
    const onConfigApplyFailure = (failedSensorId: string) => {
      configSvc.checkAutoRollback(failedSensorId)
        .catch(err => request.log.error({ err, sensorId: failedSensorId }, 'config.apply auto-rollback check failed'))
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

    // Header auth passed but no 'hello' yet holds an open socket with no
    // liveness check (pingInterval only starts post-hello). Close it if the
    // client stays silent. unref() keeps it from holding the process open.
    const helloDeadline = setTimeout(() => {
      if (!registered) closeWithReason(4408, 'hello_timeout')
    }, HEARTBEAT_INTERVAL_SECONDS * 1000)
    helloDeadline.unref()

    socket.on('close', () => cleanup(closeReason))
    socket.on('error', () => cleanup('socket_error'))

    socket.on('message', (raw: Buffer) => {
      lastActivityAt = Date.now()

      if (raw.length > SENSOR_CONTROL_MAX_MESSAGE_BYTES) {
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
        clearTimeout(helloDeadline)

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
        case 'command.ack':
        case 'command.running':
        case 'command.result': {
          const msg = message.data
          enqueue(() => svc.routeClientMessage(sensorId, msg, onConfigApplyFailure))
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
