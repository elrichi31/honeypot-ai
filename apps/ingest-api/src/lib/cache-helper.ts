import type { FastifyInstance } from 'fastify'

type Cache = FastifyInstance['cache']

export async function withCache<T>(
  cache: Cache,
  key: string,
  ttl: number,
  compute: () => Promise<T>,
): Promise<T> {
  const cached = await cache?.get(key)
  if (cached) return JSON.parse(cached) as T
  const result = await compute()
  await cache?.set(key, ttl, JSON.stringify(result))
  return result
}
