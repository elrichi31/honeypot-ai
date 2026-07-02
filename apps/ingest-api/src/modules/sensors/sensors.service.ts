import { createHash, randomBytes, randomUUID } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { SensorRepository } from './sensors.repository.js'
import { normalizeSlug } from '../../lib/sensor-utils.js'
import { probeSensorPorts, formatSensor } from '../../lib/sensor-queries.js'
import { withCache } from '../../lib/cache-helper.js'
import type { FastifyInstance } from 'fastify'
import type { SensorResult } from '../../lib/sensor-queries.js'

export type { ClientRef } from './sensors.repository.js'

const SERVICE_MAP: Record<string, string[]> = {
  ssh:          ['cowrie', 'cowrie-beacon', 'vector'],
  http:         ['web-honeypot'],
  ftp:          ['ftp-honeypot'],
  mysql:        ['mysql-honeypot'],
  port:         ['port-honeypot'],
  smb:          ['smb-honeypot'],
  deception:    ['opencanary', 'opencanary-shipper'],
  // internal deception nodes — each is its own compose block on a dedicated VM
  'int-smb':    ['smb-honeypot'],
  'int-mysql':  ['mysql-honeypot'],
  'int-ssh':    ['cowrie', 'cowrie-beacon', 'vector'],
  'int-http':   ['web-honeypot'],
}

export class SensorService {
  private repo: SensorRepository

  constructor(prisma: PrismaClient, prismaRead: PrismaClient) {
    this.repo = new SensorRepository(prisma, prismaRead)
  }

  resolveClientId(slugOrId: { slug?: string | null; name?: string | null; id?: string | null }) {
    return this.repo.resolveClientId(slugOrId)
  }

  upsertHeartbeat(args: {
    sensorId: string; clientId: string | null; name: string; protocol: string
    ip: string; version: string; ports: number[]; probePorts: number[]
    probeHost: string; now: Date
    layer?: 'external' | 'internal'; realProtocol?: string
  }) {
    return this.repo.upsertHeartbeat(args)
  }

  async list(cache: FastifyInstance['cache']): Promise<SensorResult[]> {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
    const sensors = await this.repo.list()

    // Port probes are TCP connects with a 2s timeout each; unreachable sensors make
    // GET /sensors hang for seconds. Cache the per-sensor probe result for a short
    // window. On a cold miss we wait briefly (COLD_WAIT_MS) for the probe — local
    // sensors usually answer well within that — and only fall back to {} if it
    // overruns, so the list (and the refresh after a delete) never blocks for long
    // on an unreachable sensor. The next load, ~instantly, has the warmed status.
    const COLD: Record<number, boolean> = {}
    const COLD_WAIT_MS = 1800
    const portStatuses = await Promise.all(
      sensors.map(sensor => {
        const probeKey = `sensor:ports:${sensor.sensor_id}:${sensor.probe_host}:${JSON.stringify(sensor.ports)}`
        return withCache(cache, probeKey, 20, () => probeSensorPorts(sensor), COLD, COLD_WAIT_MS)
      }),
    )
    const result = sensors.map((sensor, i) =>
      formatSensor(sensor, portStatuses[i], sensor.last_seen > twoMinutesAgo)
    )

    const hasRegisteredSsh = result.some((s) => s.protocol === 'ssh')
    if (!hasRegisteredSsh) {
      const ssh = await this.repo.getCowrieSessionCount()
      if (ssh.count > 0n) {
        result.push({
          sensorId: 'cowrie-ssh', clientId: null, clientName: null, clientSlug: null,
          clientCode: '', name: 'SSH Honeypot (Cowrie)', protocol: 'ssh', ip: '-',
          version: '', ports: [], probeHost: '', eventsTotal: Number(ssh.count),
          lastSeen: ssh.last_seen ?? new Date(0), createdAt: new Date(0),
          online: ssh.last_seen ? ssh.last_seen > twoMinutesAgo : false, degraded: false, portStatus: {},
          ownerType: 'application', applicationId: null, applicationName: null, realProtocol: null,
        })
      }
    }

    return result
  }

  async assignClient(
    sensorId: string,
    body: { clientId?: string | null; clientSlug?: string | null },
  ): Promise<
    | { ok: true; sensorId: string; clientId: string | null; clientName: string | null; clientSlug: string | null }
    | { error: string; status: number }
  > {
    let client = { id: null as string | null, name: null as string | null, slug: null as string | null }

    if (body.clientId) {
      const resolved = await this.repo.resolveClientId({ id: body.clientId })
      if (!resolved.id) return { error: 'Client not found', status: 404 }
      client = resolved
    } else if (body.clientSlug) {
      const slug = normalizeSlug(body.clientSlug)
      if (!slug) return { error: 'Invalid client slug', status: 400 }
      const existing = await this.repo.findClientBySlug(slug)
      if (!existing) return { error: 'Client not found', status: 404 }
      client = { id: existing.id, name: existing.name, slug: existing.slug }
    }

      const current = await this.repo.getSensorClientId(sensorId)
    if (!current) return { error: 'Sensor not found', status: 404 }
    // Block moving a sensor from one client to a different client.
    // application→client, client→application (unassign), and client→same client are all allowed.
    if (current.client_id && client.id && current.client_id !== client.id) {
      return { error: 'Sensor already belongs to another client. Delete and recreate it to move it.', status: 409 }
    }

    const updated = await this.repo.assignClient(sensorId, client.id)
    if (!updated) return { error: 'Sensor not found', status: 404 }

    return { ok: true, sensorId: updated.sensor_id, clientId: client.id, clientName: client.name, clientSlug: client.slug }
  }

  async delete(sensorId: string): Promise<{ deleted: boolean; alreadyGone: boolean; sensorId: string }> {
    const deleted = await this.repo.delete(sensorId)
    // Idempotent: deleting a sensor that no longer exists still satisfies the
    // caller's intent (it's gone). The list often shows a stale row after the
    // heartbeat lapses and the row is pruned, so report success either way and
    // let the client refresh to drop the phantom card.
    return { deleted: !!deleted, alreadyGone: !deleted, sensorId }
  }

  async getConfig(sensorId: string, defaultConfig: unknown): Promise<{ config: unknown; configHash: string }> {
    const row = await this.repo.getConfig(sensorId)
    return { config: row?.config ?? defaultConfig, configHash: row?.config_hash ?? '' }
  }

  async putConfig(sensorId: string, configStr: string): Promise<{ ok: true; configHash: string }> {
    const hash = createHash('sha256').update(configStr).digest('hex').slice(0, 16)
    await this.repo.upsertConfig(sensorId, configStr, hash)
    return { ok: true, configHash: hash }
  }

  async createProvisionToken(args: {
    clientId?: string | null; services: string[]; expiresInHours: number
  }): Promise<{ error: string; status: number } | { token: string; expiresAt: Date; services: string[] }> {
    if (args.clientId) {
      const client = await this.repo.findClientById(args.clientId)
      if (!client) return { error: 'Client not found', status: 404 }
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + args.expiresInHours * 3600 * 1000)
    const id = `spt_${randomBytes(8).toString('hex')}`

    await this.repo.createProvisionToken({ id, token, clientId: args.clientId ?? null, services: args.services.join(','), expiresAt })
    return { token, expiresAt, services: args.services }
  }

  async redeemProvisionToken(token: string, secret: string): Promise<
    | { error: string; status: number }
    | { lines: string }
  > {
    const row = await this.repo.redeemProvisionToken(token)
    if (!row) return { error: 'Token not found', status: 404 }
    if (row.expires_at < new Date()) return { error: 'Token expired', status: 410 }

    await this.repo.markProvisionTokenUsed(row.id)

    const selectedKeys = row.services.split(',').filter(s => s in SERVICE_MAP)
    const isInternal = selectedKeys.some(k => k.startsWith('int-'))
    const composeServices = selectedKeys.flatMap(k => SERVICE_MAP[k]).join(' ')

    const linesList = [
      `INGEST_SHARED_SECRET=${secret}`,
      `CLIENT_SLUG=${row.client_slug ?? ''}`,
      `CLIENT_NAME=${row.client_name ?? ''}`,
      // Each service protocol gets its own UUID so multiple sensors of the same
      // protocol under the same client get distinct sensor_ids.
      `SENSOR_ID_SSH=${randomUUID()}`,
      `SENSOR_ID_HTTP=${randomUUID()}`,
      `SENSOR_ID_FTP=${randomUUID()}`,
      `SENSOR_ID_MYSQL=${randomUUID()}`,
      `SENSOR_ID_PORT=${randomUUID()}`,
      `SENSOR_ID_SMB=${randomUUID()}`,
      `SENSOR_ID_DIONAEA=${randomUUID()}`,
      `ENABLED_COMPOSE_SERVICES=${composeServices}`,
      // Internal sensors register as deception nodes instead of external protocols.
      ...(isInternal ? [`SENSOR_LAYER=internal`] : []),
    ]

    return { lines: linesList.join('\n') }
  }
}
