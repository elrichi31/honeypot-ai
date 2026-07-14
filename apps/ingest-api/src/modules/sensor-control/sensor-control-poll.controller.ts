import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { sensorControlClientMessageSchema } from '../../contracts/sensor-control/protocol.js'
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
