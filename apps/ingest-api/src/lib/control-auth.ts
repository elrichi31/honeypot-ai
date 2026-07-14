import { timingSafeEqual } from 'crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'

function getHeader(request: FastifyRequest, name: string): string {
  const value = request.headers[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

export function ensureControlApiToken(request: FastifyRequest, reply: FastifyReply): boolean {
  const expected = process.env.CONTROL_API_SECRET
  if (!expected) {
    request.log.error('CONTROL_API_SECRET is not configured')
    reply.status(401).send({ error: 'Control authentication not configured' })
    return false
  }

  const provided = getHeader(request, 'x-control-api-token')
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    reply.status(401).send({ error: 'Unauthorized control request' })
    return false
  }

  return true
}
