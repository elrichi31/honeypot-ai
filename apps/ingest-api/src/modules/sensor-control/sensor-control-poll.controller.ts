import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { sensorControlClientMessageSchema } from '../../contracts/sensor-control/protocol.js'
import { ensureIngestToken } from '../../lib/ingest-auth.js'
import { SensorControlCredentialService } from './sensor-control-credential.service.js'
import { sensorConnectionRegistry } from './sensor-connection-registry.js'
import { SensorControlService } from './sensor-control.service.js'
import { SensorConfigService } from '../sensors/sensor-config.service.js'

// HTTP fallback for the WS control channel (Rebanada 6, docs/plans/
// SENSOR_REMOTE_CONTROL.md): a sensor whose WS connection is down can still
// pick up and report on commands here instead of just waiting out the TTL.
// Same sensor credential as the WS handshake, same command envelope, same
// dedup/state machine/auto-rollback wiring — see sensor-control.service.ts's
// claimDeliverable/routeClientMessage, which both transports share.
async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  credentialSvc: SensorControlCredentialService,
): Promise<string | null> {
  const sensorId = request.headers['x-sensor-id']
  const secret = request.headers['x-sensor-control-secret']
  if (typeof sensorId !== 'string' || typeof secret !== 'string' || !sensorId || !secret) {
    reply.status(401).send({ error: 'missing_credentials' })
    return null
  }
  const verified = await credentialSvc.verify(sensorId, secret)
  if (!verified) {
    reply.status(401).send({ error: 'invalid_credentials' })
    return null
  }
  return sensorId
}

export async function sensorControlPollRoutes(fastify: FastifyInstance) {
  const credentialSvc = new SensorControlCredentialService(
    fastify.prisma,
    process.env.SENSOR_CONTROL_CREDENTIAL_PEPPER ?? '',
  )
  const svc = new SensorControlService(fastify.prisma, sensorConnectionRegistry)
  const configSvc = new SensorConfigService(fastify.prisma, svc)

  // Auto-enrollment (Rebanada 8h): a freshly-installed sensor that has no
  // per-sensor control credential yet (env unset, no persisted file) trades
  // the shared INGEST_SHARED_SECRET it's already baked in for one, on its
  // own first boot. Deliberately authenticated with ensureIngestToken instead
  // of the WS handshake's verify() path, to keep that critical auth logic
  // untouched. 404 if the sensor's heartbeat hasn't created its row yet —
  // the agent retries with its normal WS reconnect backoff, no thread
  // ordering needed.
  fastify.post('/sensors/control/enroll', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply
    const sensorId = request.headers['x-sensor-id']
    if (typeof sensorId !== 'string' || !sensorId) {
      return reply.status(400).send({ error: 'missing_sensor_id' })
    }

    const result = await credentialSvc.enroll(sensorId)
    if (!result.ok) return reply.status(result.status).send({ error: result.error })
    return reply.status(201).send(result.value)
  })

  fastify.get('/sensors/control/poll', async (request, reply) => {
    const sensorId = await authenticate(request, reply, credentialSvc)
    if (!sensorId) return reply

    const commands = await svc.claimDeliverable(sensorId)
    return reply.send({ commands })
  })

  fastify.post('/sensors/control/report', async (request, reply) => {
    const sensorId = await authenticate(request, reply, credentialSvc)
    if (!sensorId) return reply

    const parsed = sensorControlClientMessageSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_message' })
    if (parsed.data.type !== 'command.ack' && parsed.data.type !== 'command.running' && parsed.data.type !== 'command.result') {
      return reply.status(400).send({ error: 'unsupported_message_type' })
    }

    await svc.routeClientMessage(sensorId, parsed.data, (failedSensorId) => {
      configSvc.checkAutoRollback(failedSensorId)
        .catch(err => request.log.error({ err, sensorId: failedSensorId }, 'config.apply auto-rollback check failed'))
    })
    return reply.status(204).send()
  })
}
