import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ensureIngestToken } from '../../lib/ingest-auth.js'
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
      layer: d.layer, realProtocol: d.realProtocol,
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

  fastify.get('/sensors/:sensorId/config', async (request, reply) => {
    const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid sensorId' })

    return reply.send(await configSvc.getConfig(params.data.sensorId, DEFAULT_COWRIE_CONFIG))
  })

  fastify.put('/sensors/:sensorId/config', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply

    const params = z.object({ sensorId: z.string().min(1) }).safeParse(request.params)
    const body = cowrieConfigSchema.safeParse(request.body)
    const actorId = z.string().trim().min(1).max(128).default('unknown').parse(request.headers['x-requested-by'])
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'Invalid config', details: body.error?.flatten() })
    }

    return reply.send(await configSvc.saveAndQueueApply({
      sensorId: params.data.sensorId,
      protocol: 'ssh',
      configStr: JSON.stringify(body.data),
      actorId,
      actorIp: normalizeIp(request.ip ?? ''),
    }))
  })
}
