import type { PrismaClient } from '@prisma/client'
import { generateControlSecret, hashSecret, secretPrefix, verifySecret } from './sensor-control-credential.crypto.js'
import { SensorControlCredentialRepository } from './sensor-control-credential.repository.js'
import { SensorControlRepository } from './sensor-control.repository.js'
import type { ControlActor } from './sensor-control.service.js'

type IssueResult =
  | { ok: true; value: { sensorId: string; secret: string; secretPrefix: string } }
  | { ok: false; error: string; status: number }

export class SensorControlCredentialService {
  private repo: SensorControlCredentialRepository
  private sensors: SensorControlRepository
  private pepper: string

  constructor(prisma: PrismaClient, pepper: string) {
    // Fail closed at boot, like CONTROL_API_SECRET in control-auth: an empty
    // pepper HMACs secrets with an empty key and still "works" end to end, so
    // a missing env would ship silently instead of being caught here.
    if (!pepper) throw new Error('SENSOR_CONTROL_CREDENTIAL_PEPPER is required')
    this.repo = new SensorControlCredentialRepository(prisma)
    this.sensors = new SensorControlRepository(prisma)
    this.pepper = pepper
  }

  async issue(args: { sensorId: string; actor: ControlActor }): Promise<IssueResult> {
    const roleOrder = { viewer: 0, analyst: 1, admin: 2, superadmin: 3 } as const
    if (roleOrder[args.actor.role] < roleOrder.admin) {
      return { ok: false, error: 'Insufficient role', status: 403 }
    }

    const scope = await this.sensors.findSensorScope(args.sensorId)
    if (!scope) return { ok: false, error: 'Sensor not found', status: 404 }
    if (!args.actor.isGlobal && (!args.actor.clientId || scope.clientId !== args.actor.clientId)) {
      return { ok: false, error: 'Sensor is outside the actor scope', status: 403 }
    }

    const secret = generateControlSecret()
    const prefix = secretPrefix(secret)
    await this.repo.upsert({
      sensorId: args.sensorId,
      secretHash: hashSecret(secret, this.pepper),
      secretPrefix: prefix,
      createdBy: args.actor.id,
    })

    return { ok: true, value: { sensorId: args.sensorId, secret, secretPrefix: prefix } }
  }

  // Auto-enroll (Rebanada 8h): no ControlActor/role — authorization is the
  // caller's ensureIngestToken check, not an operator session. Always rotates
  // (upsert), same as issue(): a sensor that lost its persisted secret file
  // re-enrolls and self-heals instead of getting stuck. This does hand a
  // holder of INGEST_SHARED_SECRET the ability to take over an already-live
  // sensor's control channel — accepted risk, see plan doc, since that same
  // secret already lets them forge that sensor's telemetry today.
  async enroll(sensorId: string): Promise<IssueResult> {
    const scope = await this.sensors.findSensorScope(sensorId)
    if (!scope) return { ok: false, error: 'Sensor not found', status: 404 }

    const secret = generateControlSecret()
    const prefix = secretPrefix(secret)
    await this.repo.upsert({
      sensorId,
      secretHash: hashSecret(secret, this.pepper),
      secretPrefix: prefix,
      createdBy: 'auto-enroll',
    })

    return { ok: true, value: { sensorId, secret, secretPrefix: prefix } }
  }

  async verify(sensorId: string, providedSecret: string): Promise<boolean> {
    const credential = await this.repo.findBySensorId(sensorId)
    if (!credential || credential.revokedAt) return false
    return verifySecret(providedSecret, credential.secretHash, this.pepper)
  }
}
