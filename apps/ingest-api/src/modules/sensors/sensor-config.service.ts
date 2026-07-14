import { createHash, randomUUID } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { SensorConfigRepository, type SensorConfigVersionRow } from './sensor-config.repository.js'
import type { ControlActor, SensorControlService } from '../sensor-control/sensor-control.service.js'

// Two consecutive config.apply failures (write error or a heartbeat that
// never confirmed the new hash before TTL) trigger an automatic rollback to
// the last version that DID get confirmed — otherwise a bad config can leave
// a sensor stuck restart-looping until an operator notices. One failure can
// be transient (slow restart, a heartbeat that lands late); two in a row is
// a pattern. See docs/plans/SENSOR_REMOTE_CONTROL.md, Rebanada 5.
const AUTO_ROLLBACK_THRESHOLD = 2
const SYSTEM_ACTOR = 'system:auto-rollback'

export class SensorConfigService {
  private repo: SensorConfigRepository

  constructor(prisma: PrismaClient, private controlService: SensorControlService) {
    this.repo = new SensorConfigRepository(prisma)
  }

  async getConfig(sensorId: string, defaultConfig: unknown): Promise<{ config: unknown; configHash: string }> {
    const row = await this.repo.getCurrent(sensorId)
    return { config: row?.config ?? defaultConfig, configHash: row?.config_hash ?? '' }
  }

  // "Save & Apply" in the dashboard dialog — both halves happen here: the
  // legacy single-row config (still read by the 10s HTTP poller, kept as
  // fallback per Rebanada 6) is updated, a new version row is recorded for
  // history/rollback, and a config.apply WS command is queued for the fast,
  // confirmed path.
  async saveAndQueueApply(args: {
    sensorId: string; protocol: string; configStr: string; actorId: string; actorIp: string
  }): Promise<{ ok: true; configHash: string }> {
    const hash = createHash('sha256').update(args.configStr).digest('hex').slice(0, 16)
    await this.repo.upsertCurrent(args.sensorId, args.configStr, hash)
    const version = await this.repo.createVersion({
      id: `cfgv_${randomUUID()}`,
      sensorId: args.sensorId,
      protocol: args.protocol,
      configStr: args.configStr,
      configHash: hash,
      createdBy: args.actorId,
    })
    await this.controlService.queueConfigApply({
      sensorId: args.sensorId,
      configHash: hash,
      requestedBy: args.actorId,
      requestedIp: args.actorIp,
      idempotencyKey: `cfg_${version.id}`,
    })
    return { ok: true, configHash: hash }
  }

  // Called from the heartbeat handler when a sensor reports its current
  // configHash. Delegates the actual command-state transition to
  // SensorControlService (it owns sensor_commands); this only updates the
  // version row's status once that transition is confirmed.
  async confirmApplied(sensorId: string, configHash: string): Promise<void> {
    const confirmed = await this.controlService.confirmConfigApplied(sensorId, configHash)
    if (!confirmed) return
    const version = await this.repo.findByHash(sensorId, configHash)
    if (version) await this.repo.markStatus(version.id, 'applied', { appliedAt: new Date() })
  }

  // Called after a config.apply command reaches a terminal failure (write
  // error, or TTL expiry with no confirming heartbeat) — see
  // sensor-control-ws.plugin.ts, which is where both failure modes surface.
  async checkAutoRollback(sensorId: string): Promise<void> {
    const failures = await this.controlService.consecutiveConfigApplyFailures(sensorId, AUTO_ROLLBACK_THRESHOLD)
    if (failures < AUTO_ROLLBACK_THRESHOLD) return
    // Another apply (possibly a previous rollback attempt) is already in
    // flight — don't stack a second one on top of it.
    if (await this.controlService.hasPendingConfigApply(sensorId)) return
    await this.applyRollback(sensorId, SYSTEM_ACTOR, 'internal')
  }

  // Operator-triggered equivalent of checkAutoRollback's core action, minus
  // the 2-failure gate — an admin can jump straight to the last confirmed-good
  // config instead of waiting for it to fail twice on its own.
  async rollbackToLastApplied(sensorId: string, actor: ControlActor): Promise<
    { ok: true; value: { version: SensorConfigVersionRow } } | { ok: false; error: string; status: number }
  > {
    const scope = await this.controlService.authorizeActor(sensorId, actor, 'admin')
    if (!scope.ok) return scope
    if (await this.controlService.hasPendingConfigApply(sensorId)) {
      return { ok: false, error: 'A config.apply is already in flight for this sensor', status: 409 }
    }
    const version = await this.applyRollback(sensorId, actor.id, actor.ip)
    if (!version) return { ok: false, error: 'No previously applied config to roll back to', status: 404 }
    return { ok: true, value: { version } }
  }

  async listVersions(sensorId: string, limit: number, actor: ControlActor): Promise<
    { ok: true; value: { versions: SensorConfigVersionRow[] } } | { ok: false; error: string; status: number }
  > {
    const scope = await this.controlService.authorizeActor(sensorId, actor, 'viewer')
    if (!scope.ok) return scope
    return { ok: true, value: { versions: await this.repo.list(sensorId, limit) } }
  }

  // Shared by the automatic (checkAutoRollback) and manual (rollbackToLastApplied)
  // paths: re-apply the last version confirmed 'applied'. Returns null if there
  // is none (e.g. the very first config ever failed, nothing to fall back to).
  private async applyRollback(sensorId: string, actorId: string, actorIp: string): Promise<SensorConfigVersionRow | null> {
    const lastGood = await this.repo.findLastApplied(sensorId)
    if (!lastGood) return null

    const configStr = JSON.stringify(lastGood.config)
    await this.repo.upsertCurrent(sensorId, configStr, lastGood.configHash)
    const version = await this.repo.createVersion({
      id: `cfgv_${randomUUID()}`,
      sensorId,
      protocol: lastGood.protocol,
      configStr,
      configHash: lastGood.configHash,
      createdBy: actorId,
    })
    await this.controlService.queueConfigApply({
      sensorId,
      configHash: lastGood.configHash,
      requestedBy: actorId,
      requestedIp: actorIp,
      idempotencyKey: `rollback_${version.id}`,
    })
    return version
  }
}
