import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../../lib/ingest-auth.js'
import { ensureControlApiToken, getControlActor } from '../../lib/control-auth.js'
import { clearSensorOfflineAlert } from '../../lib/threat-alerts.js'
import { normalizeIp } from '../../lib/sensor-utils.js'
import { SensorService } from './sensors.service.js'
import { SensorConfigService } from './sensor-config.service.js'
import { SensorControlService } from '../sensor-control/sensor-control.service.js'
import { sensorConnectionRegistry } from '../sensor-control/sensor-connection-registry.js'
import { eventBus, type SensorHeartbeatEvent } from '../../lib/event-bus.js'

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

const webHoneypotConfigSchema = z.object({
  server_header:     z.string().min(1).max(128).default('Apache/2.4.57 (Ubuntu)'),
  powered_by_header: z.string().min(1).max(128).default('PHP/8.1.2-1ubuntu2.14'),
  log_level:         z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR']).default('INFO'),
})

const DEFAULT_WEB_CONFIG = webHoneypotConfigSchema.parse({})

// port-honeypot, smb-honeypot, ftp-honeypot, mysql-honeypot: applied via a
// controlled process restart (write + os._exit, Docker's restart policy
// relaunches with the new config.py values) rather than an in-memory hot
// apply — most of their identity fields are fixed at socket-bind or
// protocol-object-construction time. See sensors/_shared/persisted_config.py.
const portConfigSchema = z.object({
  panel_title: z.string().min(1).max(80).default('Operations Dashboard'),
  panel_org:   z.string().min(1).max(80).default('Corp Internal Dashboard'),
})
const DEFAULT_PORT_CONFIG = portConfigSchema.parse({})

const smbConfigSchema = z.object({
  share_name:    z.string().min(1).max(64).default('ADMIN$'),
  share_comment: z.string().min(1).max(128).default('Corp Remote Admin'),
  server_name:   z.string().min(1).max(64).default('FS-TECHCORP-01'),
  server_os:     z.string().min(1).max(64).default('Windows Server 2022 Standard'),
  server_domain: z.string().min(1).max(64).default('TECHCORP'),
})
const DEFAULT_SMB_CONFIG = smbConfigSchema.parse({})

const ftpConfigSchema = z.object({
  banner: z.string().min(1).max(128).default('220 (vsFTPd 3.0.5)'),
})
const DEFAULT_FTP_CONFIG = ftpConfigSchema.parse({})

const mysqlConfigSchema = z.object({
  server_version: z.string().min(1).max(32).default('5.7.44-log'),
})
const DEFAULT_MYSQL_CONFIG = mysqlConfigSchema.parse({})

// Schema + default config keyed by sensor protocol — GET/PUT /config dispatch
// through this instead of hardcoding a single protocol's shape. Add an entry
// here when a new protocol gets config.apply support. Keys must match the
// exact `protocol` string each sensor reports in its heartbeat (see
// honeypot/ingest.py per sensor) — port-honeypot reports 'port-scan', not
// 'port'.
const CONFIG_SCHEMAS: Record<string, { schema: z.ZodTypeAny; default: unknown }> = {
  ssh:        { schema: cowrieConfigSchema, default: DEFAULT_COWRIE_CONFIG },
  http:       { schema: webHoneypotConfigSchema, default: DEFAULT_WEB_CONFIG },
  'port-scan': { schema: portConfigSchema, default: DEFAULT_PORT_CONFIG },
  smb:        { schema: smbConfigSchema, default: DEFAULT_SMB_CONFIG },
  ftp:        { schema: ftpConfigSchema, default: DEFAULT_FTP_CONFIG },
  mysql:      { schema: mysqlConfigSchema, default: DEFAULT_MYSQL_CONFIG },
}

const heartbeatSchema = z.object({
  sensorId:     z.string().min(1),
  name:         z.string().min(1),
  protocol:     z.string().min(1),
  clientSlug:   z.string().default(''),
  clientName:   z.string().default(''),
  ip:           z.string().default(''),
  version:      z.string().default(''),
  ports:        z.array(z.number().int().min(1).max(65535)).default([]),
  probePorts:   z.array(z.number().int().min(1).max(65535)).default([]),
  // Per-port open/closed self-probed by the sensor. Keys are display ports as
  // strings (JSON object keys); values true=open. Empty for sensors that don't
  // self-report yet — the server falls back to its own TCP probe.
  portStatus:   z.record(z.string(), z.boolean()).default({}),
  host:         z.string().default(''),
  layer:        z.enum(['external', 'internal']).default('external'),
  realProtocol: z.string().optional(),
  // Reported by cowrie-beacon's control_agent.py alongside every heartbeat —
  // see sensor-config.service.ts confirmApplied() for why the heartbeat,
  // not the agent's own command.result, is what finalizes config.apply.
  configHash:   z.string().optional(),
})

const assignClientSchema = z.object({
  clientId:   z.string().trim().nullable().optional(),
  clientSlug: z.string().trim().nullable().optional(),
})

export async function sensorRoutes(fastify: FastifyInstance) {
  const svc = new SensorService(fastify.prisma, fastify.prismaRead)
  const controlSvc = new SensorControlService(fastify.prisma, sensorConnectionRegistry)
  const configSvc = new SensorConfigService(fastify.prisma, controlSvc)

  fastify.post('/sensors/heartbeat', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const parsed = heartbeatSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid heartbeat', details: parsed.error.flatten() })

    const d = parsed.data
    const now = new Date()
    const probeHost = d.host || normalizeIp(request.ip ?? '')
    const probePorts = d.probePorts.length > 0 ? d.probePorts : d.ports
    const client = await svc.resolveClientId({ slug: d.clientSlug, name: d.clientName })

    await svc.upsertHeartbeat({
      sensorId: d.sensorId, clientId: client.id, name: d.name, protocol: d.protocol,
      ip: d.ip, version: d.version, ports: d.ports, probePorts, probeHost, now,
      portStatus: d.portStatus, layer: d.layer, realProtocol: d.realProtocol,
    })

    void clearSensorOfflineAlert(fastify.prisma, d.sensorId)
    if (d.configHash) {
      configSvc.confirmApplied(d.sensorId, d.configHash)
        .catch(err => fastify.log.error({ err, sensorId: d.sensorId }, 'config.apply heartbeat confirmation failed'))
    }

    const hb: SensorHeartbeatEvent = { type: 'sensor-heartbeat', sensorId: d.sensorId, timestamp: now.toISOString() }
    eventBus.emit('sensor-heartbeat', hb)

    return reply.status(200).send({ ok: true })
  })

  fastify.get('/sensors', async (_request, reply) => {
    const result = await svc.list(fastify.cache)
    return reply.send(result)
  })

  fastify.put('/sensors/:sensorId/client', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
    const body = assignClientSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Invalid assignment payload' })

    const result = await svc.assignClient(params.data.sensorId, body.data)
    if ('error' in result) return reply.status(result.status).send({ error: result.error })
    return reply.send({ sensorId: result.sensorId, clientId: result.clientId, clientName: result.clientName, clientSlug: result.clientSlug })
  })

  fastify.delete('/sensors/:sensorId', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid sensorId' })

    return reply.send(await svc.delete(params.data.sensorId))
  })

  // Gated like the PUT below: the config is the sensor's deception identity
  // (for ssh, the exact usernames/passwords it accepts), so an unauthenticated
  // read told anyone who could guess a sensorId what was fake.
  fastify.get('/sensors/:sensorId/config', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid sensorId' })

    const protocol = await svc.getProtocol(params.data.sensorId)
    const entry = CONFIG_SCHEMAS[protocol ?? 'ssh'] ?? CONFIG_SCHEMAS.ssh
    return reply.send(await configSvc.getConfig(params.data.sensorId, entry.default))
  })

  fastify.put('/sensors/:sensorId/config', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
    const actorId = z.string().trim().min(1).max(128).default('unknown').parse(request.headers['x-requested-by'])
    if (!params.success) return reply.status(400).send({ error: 'Invalid sensorId' })

    const protocol = await svc.getProtocol(params.data.sensorId)
    if (!protocol) return reply.status(404).send({ error: 'Sensor not found' })
    const entry = CONFIG_SCHEMAS[protocol]
    if (!entry) return reply.status(400).send({ error: `No configurable schema for protocol ${protocol}` })

    const body = entry.schema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid config', details: body.error.flatten() })
    }

    return reply.send(await configSvc.saveAndQueueApply({
      sensorId: params.data.sensorId,
      protocol,
      configStr: JSON.stringify(body.data),
      actorId,
      actorIp: normalizeIp(request.ip ?? ''),
    }))
  })

  fastify.get('/sensors/:sensorId/config/versions', async (request, reply) => {
    if (!ensureControlApiToken(request, reply)) return reply
    const actor = getControlActor(request)
    if (!actor) return reply.status(400).send({ error: 'Invalid control actor headers' })
    const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
    const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }).safeParse(request.query)
    if (!params.success || !query.success) return reply.status(400).send({ error: 'Invalid request' })

    const result = await configSvc.listVersions(params.data.sensorId, query.data.limit, actor)
    if (!result.ok) return reply.status(result.status).send({ error: result.error })
    return reply.send(result.value)
  })

  fastify.post('/sensors/:sensorId/config/rollback', async (request, reply) => {
    if (!ensureControlApiToken(request, reply)) return reply
    const actor = getControlActor(request)
    if (!actor) return reply.status(400).send({ error: 'Invalid control actor headers' })
    const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid sensorId' })

    const result = await configSvc.rollbackToLastApplied(params.data.sensorId, actor)
    if (!result.ok) return reply.status(result.status).send({ error: result.error })
    return reply.send(result.value)
  })
}
