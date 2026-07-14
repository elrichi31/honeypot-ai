import type { PrismaClient, SensorCommand } from '@prisma/client'
import { canTransitionSensorCommand, type SensorCommandStatus } from './sensor-command-state.js'
import type { SensorControlAction } from '../../contracts/sensor-control/protocol.js'

export type ControlSensorScope = { clientId: string | null } | null

type MarkResult =
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; status: SensorCommandStatus }
  | { kind: 'ok'; command: SensorCommand }

export class SensorControlRepository {
  constructor(private prisma: PrismaClient) {}

  findSensorScope(sensorId: string): Promise<ControlSensorScope> {
    return this.prisma.sensor.findUnique({
      where: { sensorId },
      select: { clientId: true },
    })
  }

  // Name is legacy from Rebanada 1 (when only 'queued' commands could go
  // stale). As of Rebanada 3, a command can sit in 'sent'/'acked'/'running'
  // indefinitely if the sensor disconnects mid-flight, so the sweep covers
  // all four non-terminal, pre-terminal statuses — otherwise such a command
  // would never resolve to a terminal state. Returns what actually expired so
  // callers can react (Rebanada 5: a config.apply that never got confirmed by
  // a heartbeat needs to count toward the auto-rollback threshold).
  async expireQueued(now: Date): Promise<Array<{ id: string; sensorId: string; action: string }>> {
    const commands = await this.prisma.sensorCommand.findMany({
      where: { status: { in: ['queued', 'sent', 'acked', 'running'] }, expiresAt: { lte: now } },
      select: { id: true, status: true, sensorId: true, action: true },
    })
    if (commands.length === 0) return []

    const expired: Array<{ id: string; sensorId: string; action: string }> = []
    await this.prisma.$transaction(async tx => {
      for (const command of commands) {
        const updated = await tx.sensorCommand.updateMany({
          where: { id: command.id, status: command.status, expiresAt: { lte: now } },
          data: { status: 'expired', completedAt: now },
        })
        if (updated.count === 0) continue
        await tx.sensorCommandEvent.create({
          data: {
            commandId: command.id,
            status: 'expired',
            actorType: 'system',
            details: { reason: 'ttl_elapsed' },
          },
        })
        expired.push({ id: command.id, sensorId: command.sensorId, action: command.action })
      }
    })
    return expired
  }

  findByIdempotencyKey(sensorId: string, idempotencyKey: string) {
    return this.prisma.sensorCommand.findUnique({
      where: { sensorId_idempotencyKey: { sensorId, idempotencyKey } },
    })
  }

  createQueued(args: {
    id: string; sensorId: string; action: SensorControlAction; payload: unknown; requestedBy: string
    requestedIp: string; idempotencyKey: string; expiresAt: Date
  }) {
    return this.prisma.$transaction(async tx => {
      const command = await tx.sensorCommand.create({
        data: {
          id: args.id,
          sensorId: args.sensorId,
          action: args.action,
          payload: (args.payload ?? {}) as object,
          status: 'queued',
          requestedBy: args.requestedBy,
          requestedIp: args.requestedIp,
          idempotencyKey: args.idempotencyKey,
          expiresAt: args.expiresAt,
        },
      })
      await tx.sensorCommandEvent.create({
        data: {
          commandId: command.id,
          status: 'queued',
          actorType: 'operator',
          actorId: args.requestedBy,
          details: { action: args.action },
        },
      })
      return command
    })
  }

  // Most recent config.apply outcomes for a sensor, newest first — used to
  // count consecutive failures for auto-rollback. 'running' is included
  // deliberately: a command still in flight breaks the consecutive-failure
  // streak (it hasn't failed yet) without needing a separate branch at the
  // call site.
  async recentConfigApplyStatuses(sensorId: string, limit: number): Promise<SensorCommandStatus[]> {
    const rows = await this.prisma.sensorCommand.findMany({
      where: { sensorId, action: 'config.apply' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { status: true },
    })
    return rows.map(r => r.status as SensorCommandStatus)
  }

  hasPendingConfigApply(sensorId: string): Promise<boolean> {
    return this.prisma.sensorCommand.findFirst({
      where: { sensorId, action: 'config.apply', status: { in: ['queued', 'sent', 'acked', 'running'] } },
      select: { id: true },
    }).then(row => row !== null)
  }

  findRunningConfigApply(sensorId: string): Promise<SensorCommand | null> {
    return this.prisma.sensorCommand.findFirst({
      where: { sensorId, action: 'config.apply', status: 'running' },
      orderBy: { createdAt: 'desc' },
    })
  }

  list(sensorId: string, limit: number) {
    return this.prisma.sensorCommand.findMany({
      where: { sensorId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  async cancelQueued(args: { commandId: string; sensorId: string; actorId: string; now: Date }) {
    return this.prisma.$transaction(async tx => {
      const command = await tx.sensorCommand.findFirst({
        where: { id: args.commandId, sensorId: args.sensorId },
      })
      if (!command) return { kind: 'not_found' as const }
      if (command.status !== 'queued') return { kind: 'not_cancellable' as const, status: command.status }

      const updated = await tx.sensorCommand.updateMany({
        where: { id: command.id, status: 'queued' },
        data: { status: 'cancelled', cancelledAt: args.now, cancelledBy: args.actorId, completedAt: args.now },
      })
      if (updated.count === 0) {
        const latest = await tx.sensorCommand.findUnique({ where: { id: command.id }, select: { status: true } })
        return { kind: 'not_cancellable' as const, status: latest?.status ?? 'expired' }
      }
      const cancelled = await tx.sensorCommand.findUniqueOrThrow({ where: { id: command.id } })
      await tx.sensorCommandEvent.create({
        data: {
          commandId: command.id,
          status: 'cancelled',
          actorType: 'operator',
          actorId: args.actorId,
          details: {},
        },
      })
      return { kind: 'cancelled' as const, command: cancelled }
    })
  }

  findDeliverable(sensorId: string, limit = 5) {
    return this.prisma.sensorCommand.findMany({
      where: { sensorId, status: 'queued', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
  }

  async markSent(args: { commandId: string; sensorId: string; now: Date }): Promise<SensorCommand | null> {
    return this.prisma.$transaction(async tx => {
      const updated = await tx.sensorCommand.updateMany({
        where: { id: args.commandId, sensorId: args.sensorId, status: 'queued' },
        data: { status: 'sent', sentAt: args.now },
      })
      if (updated.count === 0) return null
      await tx.sensorCommandEvent.create({
        data: { commandId: args.commandId, status: 'sent', actorType: 'system', details: {} },
      })
      return tx.sensorCommand.findUniqueOrThrow({ where: { id: args.commandId } })
    })
  }

  async markAcked(args: {
    commandId: string; sensorId: string; accepted: boolean; error?: unknown; now: Date
  }): Promise<MarkResult> {
    return this.prisma.$transaction(async tx => {
      const current = await tx.sensorCommand.findFirst({ where: { id: args.commandId, sensorId: args.sensorId } })
      if (!current) return { kind: 'not_found' as const }

      const target: SensorCommandStatus = args.accepted ? 'acked' : 'failed'
      if (!canTransitionSensorCommand(current.status as SensorCommandStatus, target)) {
        return { kind: 'invalid_transition' as const, status: current.status as SensorCommandStatus }
      }

      const updated = await tx.sensorCommand.updateMany({
        where: { id: args.commandId, status: current.status },
        data: target === 'acked'
          ? { status: 'acked', ackedAt: args.now }
          : { status: 'failed', completedAt: args.now, error: (args.error ?? null) as object | undefined },
      })
      if (updated.count === 0) return { kind: 'invalid_transition' as const, status: current.status as SensorCommandStatus }

      await tx.sensorCommandEvent.create({
        data: {
          commandId: args.commandId,
          status: target,
          actorType: 'sensor',
          details: (args.accepted ? {} : { error: args.error }) as object,
        },
      })
      return { kind: 'ok' as const, command: await tx.sensorCommand.findUniqueOrThrow({ where: { id: args.commandId } }) }
    })
  }

  async markRunning(args: { commandId: string; sensorId: string; now: Date }): Promise<MarkResult> {
    return this.prisma.$transaction(async tx => {
      const current = await tx.sensorCommand.findFirst({ where: { id: args.commandId, sensorId: args.sensorId } })
      if (!current) return { kind: 'not_found' as const }

      if (!canTransitionSensorCommand(current.status as SensorCommandStatus, 'running')) {
        return { kind: 'invalid_transition' as const, status: current.status as SensorCommandStatus }
      }

      const updated = await tx.sensorCommand.updateMany({
        where: { id: args.commandId, status: current.status },
        data: { status: 'running', startedAt: args.now },
      })
      if (updated.count === 0) return { kind: 'invalid_transition' as const, status: current.status as SensorCommandStatus }

      await tx.sensorCommandEvent.create({
        data: { commandId: args.commandId, status: 'running', actorType: 'sensor', details: {} },
      })
      return { kind: 'ok' as const, command: await tx.sensorCommand.findUniqueOrThrow({ where: { id: args.commandId } }) }
    })
  }

  async markResult(args: {
    commandId: string; sensorId: string; now: Date
    outcome: { status: 'succeeded'; result: unknown } | { status: 'failed'; error: unknown }
  }): Promise<MarkResult> {
    return this.prisma.$transaction(async tx => {
      const current = await tx.sensorCommand.findFirst({ where: { id: args.commandId, sensorId: args.sensorId } })
      if (!current) return { kind: 'not_found' as const }

      if (!canTransitionSensorCommand(current.status as SensorCommandStatus, args.outcome.status)) {
        return { kind: 'invalid_transition' as const, status: current.status as SensorCommandStatus }
      }

      const updated = await tx.sensorCommand.updateMany({
        where: { id: args.commandId, status: current.status },
        data: args.outcome.status === 'succeeded'
          ? { status: 'succeeded', completedAt: args.now, result: args.outcome.result as object }
          : { status: 'failed', completedAt: args.now, error: args.outcome.error as object },
      })
      if (updated.count === 0) return { kind: 'invalid_transition' as const, status: current.status as SensorCommandStatus }

      await tx.sensorCommandEvent.create({
        data: {
          commandId: args.commandId,
          status: args.outcome.status,
          actorType: 'sensor',
          details: (args.outcome.status === 'succeeded' ? {} : { error: args.outcome.error }) as object,
        },
      })
      return { kind: 'ok' as const, command: await tx.sensorCommand.findUniqueOrThrow({ where: { id: args.commandId } }) }
    })
  }
}
