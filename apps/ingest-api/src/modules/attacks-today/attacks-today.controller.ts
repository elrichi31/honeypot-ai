import type { FastifyInstance } from 'fastify'
import { AttacksTodayService } from './attacks-today.service.js'

export async function attacksTodayRoutes(fastify: FastifyInstance) {
  const svc = new AttacksTodayService(fastify.prisma)

  fastify.get('/attacks/today', async (_request, reply) => {
    return reply.send(await svc.getToday(fastify.cache))
  })
}
