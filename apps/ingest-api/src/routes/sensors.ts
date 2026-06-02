import { createHash } from 'crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../lib/ingest-auth.js'
import { clearSensorOfflineAlert } from '../lib/threat-alerts.js'
import { normalizeIp, normalizeSlug } from '../lib/sensor-utils.js'
import { resolveClientId, querySensors, probeSensorPorts, formatSensor } from '../lib/sensor-queries.js'
import { withCache } from '../lib/cache-helper.js'

const cowrieConfigSchema = z.object({
  hostname:               z.string().min(1).max(64).default('web-prod-01'),
  interactive_timeout:    z.number().int().min(30).max(3600).default(300),
  authentication_timeout: z.number().int().min(10).max(600).default(120),
  kernel_version:         z.string().min(1).max(128).default('5.15.0-91-generic'),
  kernel_build_string:    z.string().min(1).max(256).default('#101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023'),
  hardware_platform:      z.string().min(1).max(32).default('x86_64'),
  ssh_version:            z.string().min(1).max(128).default('SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6'),
  usernames:              z.array(z.string().min(1).max(64)).min(1).max(50)
    .default(['root','ubuntu','admin','oracle','postgres','git','deploy','centos','ansible','ec2-user','pi','user']),
  passwords:              z.array(z.string().min(8).max(256)).min(1).max(200)
    .default(['HoneyTrap2026!','AtlasNode91','CedarRoot88','DeltaForge73','EmberStack64',
              'FalconMesh52','GraniteKey47','HarborPulse39','IronVector28','JadeMatrix84']),
})

const DEFAULT_COWRIE_CONFIG = cowrieConfigSchema.parse({})

const heartbeatSchema = z.object({
  sensorId:    z.string().min(1),
  name:        z.string().min(1),
  protocol:    z.string().min(1),
  clientSlug:  z.string().default(''),
  clientName:  z.string().default(''),
  ip:          z.string().default(''),
  version:     z.string().default(''),
  ports:       z.array(z.number().int().min(1).max(65535)).default([]),
  probePorts:  z.array(z.number().int().min(1).max(65535)).default([]),
  host:        z.string().default(''),
})

const assignClientSchema = z.object({
  clientId:   z.string().trim().nullable().optional(),
  clientSlug: z.string().trim().nullable().optional(),
})

async function handleHeartbeat(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  if (!ensureIngestToken(request, reply)) return reply

  const parsed = heartbeatSchema.safeParse(request.body)
  if (!parsed.success) return reply.status(400).send({ error: 'Invalid heartbeat', details: parsed.error.flatten() })

  const d = parsed.data
  const now = new Date()
  const probeHost = d.host || normalizeIp(request.ip ?? '')
  const probePorts = d.probePorts.length > 0 ? d.probePorts : d.ports
  const client = await resolveClientId(fastify, { slug: d.clientSlug, name: d.clientName })

  await fastify.prisma.$executeRaw`
    INSERT INTO sensors (id, sensor_id, client_id, name, protocol, ip, version, ports, probe_ports, probe_host, last_seen, created_at)
    VALUES (gen_random_uuid()::text, ${d.sensorId}, ${client.id}, ${d.name}, ${d.protocol}, ${d.ip}, ${d.version},
      CAST(${JSON.stringify(d.ports)} AS jsonb), CAST(${JSON.stringify(probePorts)} AS jsonb),
      ${probeHost}, ${now}, ${now})
    ON CONFLICT (sensor_id) DO UPDATE SET
      client_id = COALESCE(EXCLUDED.client_id, sensors.client_id), name = EXCLUDED.name,
      protocol = EXCLUDED.protocol, ip = EXCLUDED.ip, version = EXCLUDED.version,
      ports = EXCLUDED.ports, probe_ports = EXCLUDED.probe_ports,
      probe_host = EXCLUDED.probe_host, last_seen = EXCLUDED.last_seen
  `

  void clearSensorOfflineAlert(fastify.prisma, d.sensorId)
  return reply.status(200).send({ ok: true })
}

async function handleListSensors(fastify: FastifyInstance, _request: FastifyRequest, reply: FastifyReply) {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
  const sensors = await querySensors(fastify)

  // Port probes are TCP connects with a 2s timeout each; unreachable sensors make
  // GET /sensors hang for seconds. Cache the per-sensor probe result for a short
  // window so the list stays responsive (e.g. after a delete triggers a refresh).
  const portStatuses = await Promise.all(
    sensors.map(sensor => {
      const probeKey = `sensor:ports:${sensor.sensor_id}:${sensor.probe_host}:${JSON.stringify(sensor.ports)}`
      return withCache(fastify.cache, probeKey, 20, () => probeSensorPorts(sensor))
    }),
  )
  const result = sensors.map((sensor, i) =>
    formatSensor(sensor, portStatuses[i], sensor.last_seen > twoMinutesAgo)
  )

  const hasRegisteredSsh = result.some((s) => s.protocol === 'ssh')
  if (!hasRegisteredSsh) {
    const [ssh] = await fastify.prisma.$queryRaw<Array<{ count: bigint; last_seen: Date | null }>>`
      SELECT COUNT(*) AS count, MAX(started_at) AS last_seen FROM sessions
    `
    if (ssh && ssh.count > 0n) {
      result.push({
        sensorId: 'cowrie-ssh', clientId: null, clientName: null, clientSlug: null,
        clientCode: '', name: 'SSH Honeypot (Cowrie)', protocol: 'ssh', ip: '-',
        version: '', ports: [], probeHost: '', eventsTotal: Number(ssh.count),
        lastSeen: ssh.last_seen ?? new Date(0), createdAt: new Date(0),
        online: ssh.last_seen ? ssh.last_seen > twoMinutesAgo : false, portStatus: {},
      })
    }
  }

  return reply.send(result)
}

async function handleAssignClient(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  if (!ensureIngestToken(request, reply)) return reply

  const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
  const body = assignClientSchema.safeParse(request.body)
  if (!params.success || !body.success) return reply.status(400).send({ error: 'Invalid assignment payload' })

  let client = { id: null as string | null, name: null as string | null, slug: null as string | null }

  if (body.data.clientId) {
    client = await resolveClientId(fastify, { id: body.data.clientId })
    if (!client.id) return reply.status(404).send({ error: 'Client not found' })
  } else if (body.data.clientSlug) {
    const slug = normalizeSlug(body.data.clientSlug)
    if (!slug) return reply.status(400).send({ error: 'Invalid client slug' })
    const [existing] = await fastify.prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
      SELECT id, name, slug FROM clients WHERE slug = ${slug} LIMIT 1
    `
    client = existing ? { id: existing.id, name: existing.name, slug: existing.slug } : client
    if (!client.id) return reply.status(404).send({ error: 'Client not found' })
  }

  const [updated] = await fastify.prisma.$queryRaw<Array<{ sensor_id: string }>>`
    UPDATE sensors SET client_id = ${client.id} WHERE sensor_id = ${params.data.sensorId} RETURNING sensor_id
  `
  if (!updated) return reply.status(404).send({ error: 'Sensor not found' })

  return reply.send({ sensorId: updated.sensor_id, clientId: client.id, clientName: client.name, clientSlug: client.slug })
}

async function handleDeleteSensor(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  if (!ensureIngestToken(request, reply)) return reply

  const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
  if (!params.success) return reply.status(400).send({ error: 'Invalid sensorId' })

  const [deleted] = await fastify.prisma.$queryRaw<Array<{ sensor_id: string }>>`
    DELETE FROM sensors WHERE sensor_id = ${params.data.sensorId} RETURNING sensor_id
  `
  if (!deleted) return reply.status(404).send({ error: 'Sensor not found' })

  return reply.send({ deleted: true, sensorId: deleted.sensor_id })
}

async function handleGetConfig(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
  if (!params.success) return reply.status(400).send({ error: 'Invalid sensorId' })

  const rows = await fastify.prisma.$queryRaw<Array<{ config: unknown; config_hash: string }>>`
    SELECT config, config_hash FROM sensor_configs WHERE sensor_id = ${params.data.sensorId}
  `
  const row = rows[0]
  return reply.send({
    config: row?.config ?? DEFAULT_COWRIE_CONFIG,
    configHash: row?.config_hash ?? '',
  })
}

async function handlePutConfig(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  if (!ensureIngestToken(request, reply)) return reply

  const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
  const body = cowrieConfigSchema.safeParse(request.body)
  if (!params.success || !body.success) {
    return reply.status(400).send({ error: 'Invalid config', details: body.error?.flatten() })
  }

  const configStr = JSON.stringify(body.data)
  const hash = createHash('sha256').update(configStr).digest('hex').slice(0, 16)

  await fastify.prisma.$executeRaw`
    INSERT INTO sensor_configs (sensor_id, config, config_hash, updated_at)
    VALUES (${params.data.sensorId}, CAST(${configStr} AS jsonb), ${hash}, NOW())
    ON CONFLICT (sensor_id) DO UPDATE SET
      config      = EXCLUDED.config,
      config_hash = EXCLUDED.config_hash,
      updated_at  = EXCLUDED.updated_at
  `

  return reply.send({ ok: true, configHash: hash })
}

export async function sensorRoutes(fastify: FastifyInstance) {
  fastify.post('/sensors/heartbeat', (req, rep) => handleHeartbeat(fastify, req, rep))
  fastify.get('/sensors',            (req, rep) => handleListSensors(fastify, req, rep))
  fastify.put('/sensors/:sensorId/client', (req, rep) => handleAssignClient(fastify, req, rep))
  fastify.delete('/sensors/:sensorId',     (req, rep) => handleDeleteSensor(fastify, req, rep))
  fastify.get('/sensors/:sensorId/config', (req, rep) => handleGetConfig(fastify, req, rep))
  fastify.put('/sensors/:sensorId/config', (req, rep) => handlePutConfig(fastify, req, rep))
}
