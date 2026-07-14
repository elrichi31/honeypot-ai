import { randomUUID } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import type {
  SensorControlClientMessage,
  SensorControlCommand,
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
  // a terminal state — a periodic caller drives this independently. Returns
  // what expired so the caller can react (a config.apply that never got
  // confirmed by a heartbeat counts toward sensor-config's auto-rollback).
  async sweepExpired(): Promise<Array<{ id: string; sensorId: string; action: string }>> {
    return this.repo.expireQueued(new Date())
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
      payload: {},
      requestedBy: args.actor.id,
      requestedIp: args.actor.ip,
      idempotencyKey: args.idempotencyKey,
      expiresAt: new Date(Date.now() + 60_000),
    })
    await this.attemptDelivery(args.sensorId)
    return { ok: true as const, value: { command, replayed: false } }
  }

  // Queued from the sensors module's config save flow (PUT /sensors/:id/config)
  // and from its auto-rollback path — both are already authorized by that
  // module's own auth chain (INGEST_SHARED_SECRET, or 'system' for rollback),
  // so this skips the ControlActor role/scope check the operator-facing
  // queue*/cancel/list routes use. 90s TTL (vs status.get's 60s): a config
  // apply needs to survive a full cowrie restart + reconnect + up to one
  // heartbeat interval (30s) before the confirming heartbeat can even arrive.
  async queueConfigApply(args: {
    sensorId: string; configHash: string; requestedBy: string; requestedIp: string; idempotencyKey: string
  }) {
    await this.repo.expireQueued(new Date())
    const scope = await this.repo.findSensorScope(args.sensorId)
    if (!scope) return { ok: false as const, error: 'Sensor not found', status: 404 }

    const existing = await this.repo.findByIdempotencyKey(args.sensorId, args.idempotencyKey)
    if (existing) {
      await this.attemptDelivery(args.sensorId)
      return { ok: true as const, value: { command: existing, replayed: true } }
    }

    const command = await this.repo.createQueued({
      id: `cmd_${randomUUID()}`,
      sensorId: args.sensorId,
      action: 'config.apply',
      payload: { configHash: args.configHash },
      requestedBy: args.requestedBy,
      requestedIp: args.requestedIp,
      idempotencyKey: args.idempotencyKey,
      expiresAt: new Date(Date.now() + 90_000),
    })
    await this.attemptDelivery(args.sensorId)
    return { ok: true as const, value: { command, replayed: false } }
  }

  // Driven by the sensor heartbeat (HTTP), not the WS connection: config.apply
  // never gets a command.result from the agent on success (see
  // control_agent.py) — only the NEXT heartbeat reporting the matching
  // configHash proves cowrie actually came back up with it, which is the
  // whole point of this slice (an agent self-reporting "succeeded" right
  // after writing files can't know if the restart that follows is healthy).
  // Returns the confirmed command so the caller (sensor-config.service.ts)
  // can mark its config version row 'applied'.
  async confirmConfigApplied(sensorId: string, configHash: string) {
    const running = await this.repo.findRunningConfigApply(sensorId)
    if (!running) return null
    const payload = running.payload as { configHash?: string }
    if (payload.configHash !== configHash) return null

    const result = await this.repo.markResult({
      commandId: running.id,
      sensorId,
      now: new Date(),
      outcome: { status: 'succeeded', result: { configHash, confirmedVia: 'heartbeat' } },
    })
    if (result.kind !== 'ok') return null

    eventBus.emit('command.result', {
      type: 'command.result',
      commandId: running.id,
      sensorId,
      status: 'succeeded',
      timestamp: new Date().toISOString(),
    })
    return { commandId: running.id }
  }

  // Leading-N consecutive config.apply failures (failed or expired), newest
  // first. Used by sensor-config.service.ts to decide whether to auto-roll
  // back instead of leaving a sensor stuck on a bad config indefinitely.
  async consecutiveConfigApplyFailures(sensorId: string, limit: number): Promise<number> {
    const recent = await this.repo.recentConfigApplyStatuses(sensorId, limit)
    let count = 0
    for (const status of recent) {
      if (status === 'failed' || status === 'expired') count++
      else break
    }
    return count
  }

  hasPendingConfigApply(sensorId: string): Promise<boolean> {
    return this.repo.hasPendingConfigApply(sensorId)
  }

  // Marks queued commands 'sent' via the same CAS transition (markSent's
  // `where: status = 'queued'`) regardless of which transport claims them —
  // that CAS is the entire "lease" mechanism Rebanada 6 needs to stop WS and
  // the HTTP fallback poll from both delivering the same command: whichever
  // caller's markSent lands first wins, the other's updateMany matches zero
  // rows and moves on. No separate lease table or column required.
  //
  // markSent() runs and is awaited BEFORE the message is handed to the
  // caller to send: a fast sensor can ack a command within milliseconds of
  // receiving it, and command.ack handling validates the transition against
  // the command's CURRENT status in the database. If the message went out
  // first, a sensor replying instantly could have its ack race markSent()'s
  // write and get rejected as "invalid_transition" from 'queued' (caught
  // manually with the real simulator). Persisting 'sent' first guarantees
  // any ack arriving after the message is physically in flight sees a DB
  // state that's already caught up.
  async claimDeliverable(sensorId: string): Promise<SensorControlCommand[]> {
    const deliverable = await this.repo.findDeliverable(sensorId)
    const claimed: SensorControlCommand[] = []
    for (const command of deliverable) {
      const sent = await this.repo.markSent({ commandId: command.id, sensorId, now: new Date() })
      if (!sent) continue
      claimed.push(buildCommandMessage(sent))
      eventBus.emit('command.sent', {
        type: 'command.sent',
        commandId: command.id,
        sensorId,
        action: command.action,
        timestamp: new Date().toISOString(),
      })
    }
    return claimed
  }

  // Called both right after a command is queued (sensor may already be
  // connected) and right after a sensor connects (commands may have been
  // queued while it was offline). No-ops if the sensor has no live WS
  // connection — that's not a failure, it just means delivery is left to the
  // HTTP fallback poll (Rebanada 6) or the next WS reconnect.
  async attemptDelivery(sensorId: string): Promise<void> {
    const connection = this.connectionRegistry.get(sensorId)
    if (!connection) return

    const claimed = await this.claimDeliverable(sensorId)
    for (const message of claimed) {
      // Known, accepted race: the socket could close between registry.get()
      // above and this send() call. connection.send() silently no-ops if the
      // socket isn't OPEN. This cannot produce a false "succeeded" — only a
      // real command.ack can move a command past 'sent' (see
      // sensor-command-state.ts), and the 60s/90s TTL (via expireQueued)
      // resolves anything stuck in 'sent' with no ACK.
      connection.send(message)
    }
  }

  // Every command.ack/running/result — over WS or the HTTP fallback poll's
  // report endpoint — routes through here, so both transports share
  // identical state transitions, SSE emission, and the config.apply
  // auto-rollback trigger. onConfigApplyFailure is a callback rather than a
  // direct import so this module still doesn't need to know what a "config"
  // is (see sensor-config.service.ts, which owns that one-way dependency).
  async routeClientMessage(
    sensorId: string,
    msg: SensorControlClientMessage,
    onConfigApplyFailure?: (sensorId: string) => void,
  ): Promise<void> {
    const nowIso = () => new Date().toISOString()
    switch (msg.type) {
      case 'command.ack': {
        if (msg.sensorId !== sensorId) return
        const result = await this.repo.markAcked({
          commandId: msg.commandId,
          sensorId,
          now: new Date(),
          accepted: msg.accepted,
          error: msg.accepted ? undefined : msg.error,
        })
        if (result.kind !== 'ok') return
        eventBus.emit('command.acked', {
          type: 'command.acked', commandId: msg.commandId, sensorId, accepted: msg.accepted, timestamp: nowIso(),
        })
        return
      }
      case 'command.running': {
        if (msg.sensorId !== sensorId) return
        const result = await this.repo.markRunning({ commandId: msg.commandId, sensorId, now: new Date() })
        if (result.kind !== 'ok') return
        eventBus.emit('command.running', { type: 'command.running', commandId: msg.commandId, sensorId, timestamp: nowIso() })
        return
      }
      case 'command.result': {
        if (msg.sensorId !== sensorId) return
        const result = await this.repo.markResult({
          commandId: msg.commandId,
          sensorId,
          now: new Date(),
          outcome: msg.status === 'succeeded'
            ? { status: 'succeeded', result: msg.result }
            : { status: 'failed', error: msg.error },
        })
        if (result.kind !== 'ok') return
        // config.apply only ever sends command.result on a write failure —
        // success is confirmed by the next heartbeat instead. A failure here
        // is one of the two signals (with TTL expiry) that feeds the
        // auto-rollback threshold.
        if (result.command.action === 'config.apply' && msg.status === 'failed') {
          onConfigApplyFailure?.(sensorId)
        }
        eventBus.emit('command.result', {
          type: 'command.result', commandId: msg.commandId, sensorId, status: msg.status, timestamp: nowIso(),
        })
        return
      }
      default:
        return
    }
  }

  async getConnectionStatus(args: { sensorId: string; actor: ControlActor }) {
    const scope = await this.authorize(args.sensorId, args.actor, 'viewer')
    if (!scope.ok) return scope
    const connection = this.connectionRegistry.get(args.sensorId)
    return {
      ok: true as const,
      value: {
        connected: !!connection,
        capabilities: connection?.capabilities ?? [],
        agentVersion: connection?.agentVersion ?? null,
      },
    }
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

  // Public wrapper so other modules (sensor-config.service.ts, for
  // config-version history and rollback) can reuse the same role+tenant scope
  // check instead of re-implementing it against SensorControlRepository.
  authorizeActor(
    sensorId: string,
    actor: ControlActor,
    minimumRole: 'viewer' | 'analyst' | 'admin',
  ): Promise<ControlResult<undefined>> {
    return this.authorize(sensorId, actor, minimumRole)
  }

  private async authorize(
    sensorId: string,
    actor: ControlActor,
    minimumRole: 'viewer' | 'analyst' | 'admin',
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
