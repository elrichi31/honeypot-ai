import fp from 'fastify-plugin'
import Redis from 'ioredis'
import type { FastifyInstance } from 'fastify'

interface AppCache {
  get(key: string): Promise<string | null>
  set(key: string, ttlSeconds: number, value: string): Promise<void>
}

declare module 'fastify' {
  interface FastifyInstance {
    cache: AppCache | null
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const url = process.env.REDIS_URL
  if (!url) {
    fastify.decorate('cache', null)
    fastify.log.info('REDIS_URL not set — query caching disabled')
    return
  }

  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  })

  try {
    await redis.connect()
    fastify.log.info('Redis connected — query caching enabled')
  } catch (err) {
    fastify.log.warn({ err }, 'Redis connection failed — query caching disabled')
    fastify.decorate('cache', null)
    return
  }

  fastify.decorate('cache', {
    async get(key: string): Promise<string | null> {
      try {
        return await redis.get(key)
      } catch {
        return null
      }
    },
    async set(key: string, ttlSeconds: number, value: string): Promise<void> {
      try {
        await redis.setex(key, ttlSeconds, value)
      } catch {}
    },
  })

  fastify.addHook('onClose', async () => {
    redis.disconnect()
  })
})
