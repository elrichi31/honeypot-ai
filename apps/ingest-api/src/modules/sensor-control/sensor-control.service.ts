import { randomUUID } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import type {
  SensorControlCommandAck,
  SensorControlCommandResult,
  SensorControlCommandRunning,
} from '../../contracts/sensor-control/protocol.js'
import { eventBus } from '../../lib/event-bus.js'
import { buildCommandMessage } from './sensor-control-message.builder.js'
import type { SensorConnectionRegistry } from './sensor-connection-registry.js'
import { SensorControlRepository } from './sensor-control.repository.js'

export type ControlActor = {
  id: string
  role: 'viewer' | 'analyst' | 'admin' | 'superadmin'
  clientId: string | null
  isSuperadmin: boolean
  ip: string
}

type ControlResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: number }

export class SensorControlService {
  private repo: SensorControlRepository

  constructor(prisma: PrismaClient, private connectionRegistry: SensorConnectionRegistry) {
    this.repo = new SensorControlRepository(prisma)
  }

  // Resolve commands whose TTL elapsed while stuck in a non-terminal state
  // (e.g. the sensor disconnected mid-flight). The REST paths sweep lazily on
  // each call, but without operator traffic a stuck command would never reach
  // a terminal state — a periodic caller drives this independently.
  async sweepExpired(): Promise<void> {
    await this.repo.expireQueued(new Date())
  }

  async queueStatusGet(args: { sensorId: string; idempotencyKey: string; actor: ControlActor }) {
    await this.repo.expireQueued(new Date())
    const scope = await this.authorize(args.sensorId, args.actor, 'analyst')
    if (!scope.ok) return scope

    const existing = await this.repo.findByIdempotencyKey(args.sensorId, args.idempotencyKey)
    if (existing) {
      await this.attemptDelivery(args.sensorId)
      return { ok: true as const, value: { command: existing, replayed: true } }
    }

    const command = await this.repo.createQueued({
      id: `cmd_${randomUUID()}`,
      sensorId: args.sensorId,
      action: 'status.get',
      requestedBy: args.actor.id,
      requestedIp: args.actor.ip,
      idempotencyKey: args.idempotencyKey,
      expiresAt: new Date(Date.now() + 60_000),
    })
    await this.attemptDelivery(args.sensorId)
    return { ok: true as const, value: { command, replayed: false } }
  }

  // Called both right after a command is queued (sensor may already be
  // connected) and right after a sensor connects (commands may have been
  // queued while it was offline).
  //
  // markSent() runs and is awaited BEFORE connection.send(): a fast sensor
  // can ack a command within milliseconds of receiving it, and command.ack
  // handling validates the transition against the command's CURRENT status
  // in the database. If send() went out first, a sensor replying instantly
  // could have its ack race markSent()'s write and get rejected as
  // "invalid_transition" from 'queued' (this was caught manually with the
  // real simulator — the WS integration tests didn't catch it because the
  // test client always waits for the 'command' message before acking,
  // which incidentally gives markSent's await time to land). Persisting
  // 'sent' first guarantees any ack that arrives after the message is
  // physically on the wire sees a DB state that's already caught up.
  async attemptDelivery(sensorId: string): Promise<void> {
    const connection = this.connectionRegistry.get(sensorId)
    if (!connection) return

    const deliverable = await this.repo.findDeliverable(sensorId)
    for (const command of deliverable) {
      const sent = await this.repo.markSent({ commandId: command.id, sensorId, now: new Date() })
      if (!sent) continue
      // Known, accepted race: the socket could close between registry.get()
      // above and this send() call. connection.send() silently no-ops if the
      // socket isn't OPEN. This cannot produce a false "succeeded" — only a
      // real command.ack can move a command past 'sent' (see
      // sensor-command-state.ts), and the 60s TTL (via expireQueued)
      // resolves anything stuck in 'sent' with no ACK.
      connection.send(buildCommandMessage(command))
      eventBus.emit('command.sent', {
        type: 'command.sent',
        commandId: command.id,
        sensorId,
        action: command.action,
        timestamp: new Date().toISOString(),
      })
    }
  }

  // The next three methods are driven by the authenticated WS connection
  // (already bound to one sensorId at the transport layer), not by an
  // operator ControlActor — no role/scope check applies here.
  async handleAck(sensorId: string, msg: SensorControlCommandAck) {
    return this.repo.markAcked({
      commandId: msg.commandId,
      sensorId,
      now: new Date(),
      accepted: msg.accepted,
      error: msg.accepted ? undefined : msg.error,
    })
  }

  async handleRunning(sensorId: string, msg: SensorControlCommandRunning) {
    return this.repo.markRunning({ commandId: msg.commandId, sensorId, now: new Date() })
  }

  async handleResult(sensorId: string, msg: SensorControlCommandResult) {
    return this.repo.markResult({
      commandId: msg.commandId,
      sensorId,
      now: new Date(),
      outcome: msg.status === 'succeeded'
        ? { status: 'succeeded', result: msg.result }
        : { status: 'failed', error: msg.error },
    })
  }

  async listCommands(args: { sensorId: string; limit: number; actor: ControlActor }) {
    await this.repo.expireQueued(new Date())
    const scope = await this.authorize(args.sensorId, args.actor, 'viewer')
    if (!scope.ok) return scope
    return { ok: true as const, value: { commands: await this.repo.list(args.sensorId, args.limit) } }
  }

  async cancelCommand(args: { sensorId: string; commandId: string; actor: ControlActor }) {
    await this.repo.expireQueued(new Date())
    const scope = await this.authorize(args.sensorId, args.actor, 'analyst')
    if (!scope.ok) return scope

    const result = await this.repo.cancelQueued({
      commandId: args.commandId,
      sensorId: args.sensorId,
      actorId: args.actor.id,
      now: new Date(),
    })
    if (result.kind === 'not_found') return { ok: false as const, error: 'Command not found', status: 404 }
    if (result.kind === 'not_cancellable') return { ok: false as const, error: `Command is already ${result.status}`, status: 409 }
    return { ok: true as const, value: { command: result.command } }
  }

  private async authorize(
    sensorId: string,
    actor: ControlActor,
    minimumRole: 'viewer' | 'analyst',
  ): Promise<ControlResult<undefined>> {
    const roleOrder = { viewer: 0, analyst: 1, admin: 2, superadmin: 3 } as const
    if (roleOrder[actor.role] < roleOrder[minimumRole]) {
      return { ok: false, error: 'Insufficient role', status: 403 }
    }

    const scope = await this.repo.findSensorScope(sensorId)
    if (!scope) return { ok: false, error: 'Sensor not found', status: 404 }
    if (!actor.isSuperadmin && (!actor.clientId || scope.clientId !== actor.clientId)) {
      return { ok: false, error: 'Sensor is outside the actor scope', status: 403 }
    }
    return { ok: true, value: undefined }
  }
}
