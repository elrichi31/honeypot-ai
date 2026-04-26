import type { FastifyInstance } from 'fastify'
import { overviewRoute } from './timeline.js'
import { dashboardRoute } from './dashboard.js'
import { credentialsRoute } from './credentials.js'
import { miscRoutes } from './misc.js'

export async function statsRoutes(fastify: FastifyInstance) {
  await overviewRoute(fastify)
  await dashboardRoute(fastify)
  await credentialsRoute(fastify)
  await miscRoutes(fastify)
}
