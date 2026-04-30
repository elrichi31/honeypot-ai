import type { FastifyInstance } from 'fastify'
import { eventBus, type AttackEvent } from '../lib/event-bus.js'

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

    const listener = (event: AttackEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    eventBus.on('attack', listener)

    const heartbeat = setInterval(() => res.write(':\n\n'), 25_000)

    request.raw.on('close', () => {
      eventBus.off('attack', listener)
      clearInterval(heartbeat)
    })
  })
}
