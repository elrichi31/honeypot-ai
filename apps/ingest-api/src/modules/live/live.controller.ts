import type { FastifyInstance } from 'fastify'
import { eventBus, type LiveEvent } from '../lib/event-bus.js'

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

    const heartbeat = setInterval(() => res.write(':\n\n'), 25_000)

    request.raw.on('close', () => {
      eventBus.off('attack', send)
      eventBus.off('alert', send)
      eventBus.off('sensor-heartbeat', send)
      clearInterval(heartbeat)
    })
  })
}
