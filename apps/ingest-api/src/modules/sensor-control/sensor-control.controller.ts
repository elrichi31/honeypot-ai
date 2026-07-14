import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ensureControlApiToken } from '../../lib/control-auth.js'
import { SensorControlCredentialService } from './sensor-control-credential.service.js'
import { sensorConnectionRegistry } from './sensor-connection-registry.js'
import { SensorControlService, type ControlActor } from './sensor-control.service.js'

const actorHeadersSchema = z.object({
  'x-control-actor-id': z.string().trim().min(1).max(128),
  'x-control-actor-role': z.enum(['viewer', 'analyst', 'admin', 'superadmin']),
  'x-control-actor-client-id': z.string().trim().min(1).max(128).optional(),
  'x-control-actor-superadmin': z.enum(['true', 'false']),
  'x-control-actor-ip': z.string().trim().min(1).max(128),
}).passthrough()

const sensorParamsSchema = z.object({ sensorId: z.string().trim().min(1).max(128) })
const commandParamsSchema = sensorParamsSchema.extend({ commandId: z.string().trim().min(1).max(128) })
// This route only ever creates status.get commands (handler always calls
// queueStatusGet). config.apply is deliberately NOT createable here — it's
// queued from PUT /sensors/:id/config -> SensorConfigService.saveAndQueueApply,
// which also records the config version row a plain command doesn't carry.
// Pin the literal instead of the general wire-protocol action enum so this
// endpoint can't silently accept a config.apply request and create the
// wrong command underneath it.
const createCommandSchema = z.object({
  action: z.literal('status.get'),
  payload: z.object({}).strict(),
}).strict()
const listQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) })

function getActor(request: FastifyRequest): ControlActor | null {
  const parsed = actorHeadersSchema.safeParse(request.headers)
  if (!parsed.success) return null
  const headers = parsed.data
  const isSuperadmin = headers['x-control-actor-superadmin'] === 'true'
  if (isSuperadmin !== (headers['x-control-actor-role'] === 'superadmin')) return null

  return {
    id: headers['x-control-actor-id'],
    role: headers['x-control-actor-role'],
    clientId: headers['x-control-actor-client-id'] ?? null,
    isSuperadmin,
    ip: headers['x-control-actor-ip'],
  }
}

export async function sensorControlRoutes(fastify: FastifyInstance) {
  const svc = new SensorControlService(fastify.prisma, sensorConnectionRegistry)
  const credentialSvc = new SensorControlCredentialService(
    fastify.prisma,
    process.env.SENSOR_CONTROL_CREDENTIAL_PEPPER ?? '',
  )

  fastify.post('/sensors/:sensorId/commands', async (request, reply) => {
    if (!ensureControlApiToken(request, reply)) return reply
    const actor = getActor(request)
    if (!actor) return reply.status(400).send({ error: 'Invalid control actor headers' })
    const params = sensorParamsSchema.safeParse(request.params)
    const body = createCommandSchema.safeParse(request.body)
    const idempotencyKey = z.string().uuid().safeParse(request.headers['idempotency-key'])
    if (!params.success || !body.success || !idempotencyKey.success) {
      return reply.status(400).send({ error: 'Invalid command request' })
    }

    const result = await svc.queueStatusGet({ sensorId: params.data.sensorId, idempotencyKey: idempotencyKey.data, actor })
    if (!result.ok) return reply.status(result.status).send({ error: result.error })
    return reply.status(result.value.replayed ? 200 : 201).send(result.value)
  })

  fastify.get('/sensors/:sensorId/control-status', async (request, reply) => {
    if (!ensureControlApiToken(request, reply)) return reply
    const actor = getActor(request)
    if (!actor) return reply.status(400).send({ error: 'Invalid control actor headers' })
    const params = sensorParamsSchema.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid sensor id' })

    const result = await svc.getConnectionStatus({ sensorId: params.data.sensorId, actor })
    if (!result.ok) return reply.status(result.status).send({ error: result.error })
    return reply.send(result.value)
  })

  fastify.get('/sensors/:sensorId/commands', async (request, reply) => {
    if (!ensureControlApiToken(request, reply)) return reply
    const actor = getActor(request)
    if (!actor) return reply.status(400).send({ error: 'Invalid control actor headers' })
    const params = sensorParamsSchema.safeParse(request.params)
    const query = listQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) return reply.status(400).send({ error: 'Invalid command query' })

    const result = await svc.listCommands({ sensorId: params.data.sensorId, limit: query.data.limit ?? 20, actor })
    if (!result.ok) return reply.status(result.status).send({ error: result.error })
    return reply.send(result.value)
  })

  fastify.post('/sensors/:sensorId/commands/:commandId/cancel', async (request, reply) => {
    if (!ensureControlApiToken(request, reply)) return reply
    const actor = getActor(request)
    if (!actor) return reply.status(400).send({ error: 'Invalid control actor headers' })
    const params = commandParamsSchema.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid command parameters' })

    const result = await svc.cancelCommand({
      sensorId: params.data.sensorId,
      commandId: params.data.commandId,
      actor,
    })
    if (!result.ok) return reply.status(result.status).send({ error: result.error })
    return reply.send(result.value)
  })

  // The response body is the ONLY time the raw secret is ever visible again —
  // it is stored hashed. The caller (dashboard operator) must copy it now.
  fastify.post('/sensors/:sensorId/control-credential', async (request, reply) => {
    if (!ensureControlApiToken(request, reply)) return reply
    const actor = getActor(request)
    if (!actor) return reply.status(400).send({ error: 'Invalid control actor headers' })
    const params = sensorParamsSchema.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'Invalid sensor id' })

    const result = await credentialSvc.issue({ sensorId: params.data.sensorId, actor })
    if (!result.ok) return reply.status(result.status).send({ error: result.error })
    return reply.status(201).send(result.value)
  })
}
