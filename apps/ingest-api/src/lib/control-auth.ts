import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ControlActor } from '../modules/sensor-control/sensor-control.service.js'

function getHeader(request: FastifyRequest, name: string): string {
  const value = request.headers[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

const actorHeadersSchema = z.object({
  'x-control-actor-id': z.string().trim().min(1).max(128),
  'x-control-actor-role': z.enum(['viewer', 'analyst', 'admin', 'superadmin']),
  'x-control-actor-client-id': z.string().trim().min(1).max(128).optional(),
  'x-control-actor-superadmin': z.enum(['true', 'false']),
  'x-control-actor-ip': z.string().trim().min(1).max(128),
}).passthrough()

// Shared by every route that authenticates a dashboard operator against the
// control plane (sensor-control + sensor-config routes) — one place to parse
// the actor headers the BFF (lib/sensor-control.ts controlHeaders()) sends.
export function getControlActor(request: FastifyRequest): ControlActor | null {
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
