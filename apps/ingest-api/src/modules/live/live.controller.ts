import type { FastifyInstance } from 'fastify'
import { eventBus, type LiveEvent } from '../../lib/event-bus.js'

export async function liveRoutes(fastify: FastifyInstance) {
  fastify.get('/events/live', (request, reply) => {
    reply.hijack()
    const res = reply.raw

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write(':\n\n')

    const send = (event: LiveEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    eventBus.on('attack', send)
    eventBus.on('alert', send)
    eventBus.on('sensor-heartbeat', send)
    eventBus.on('sensor.connected', send)
    eventBus.on('sensor.disconnected', send)
    eventBus.on('command.sent', send)
    eventBus.on('command.acked', send)
    eventBus.on('command.running', send)
    eventBus.on('command.result', send)

    const heartbeat = setInterval(() => res.write(':\n\n'), 25_000)

    request.raw.on('close', () => {
      eventBus.off('attack', send)
      eventBus.off('alert', send)
      eventBus.off('sensor-heartbeat', send)
      eventBus.off('sensor.connected', send)
      eventBus.off('sensor.disconnected', send)
      eventBus.off('command.sent', send)
      eventBus.off('command.acked', send)
      eventBus.off('command.running', send)
      eventBus.off('command.result', send)
      clearInterval(heartbeat)
    })
  })
}
