import type { FastifyInstance } from 'fastify'

type Cache = FastifyInstance['cache']

interface CacheEnvelope<T> {
  freshUntil: number
  value: T
}

// In-flight computations, keyed by cache key, so concurrent requests for the
// same key don't each kick off the (heavy) compute. The first one runs it; the
// rest await the same promise.
const inFlight = new Map<string, Promise<unknown>>()

function computeOnce<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>
  const promise = compute().finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

/**
 * Cache with stale-while-revalidate semantics.
 *
 * Once a key has been computed once, callers never block on the heavy compute
 * again: a stale-but-present value is returned immediately while a single
 * background recompute refreshes it. Only the very first request (no value at
 * all) waits for the compute. The physical TTL is kept longer than the
 * freshness window so the stale value survives to be served during refresh.
 *
 * This keeps expensive dashboard aggregates (8+ queries) from ever surfacing as
 * a timeout once the cache is warm.
 */
export async function withCache<T>(
  cache: Cache,
  key: string,
  ttl: number,
  compute: () => Promise<T>,
): Promise<T> {
  if (!cache) return compute()

  const raw = await cache.get(key)

  const store = async (): Promise<T> => {
    const value = await computeOnce(key, compute)
    const envelope: CacheEnvelope<T> = { freshUntil: Date.now() + ttl * 1000, value }
    // Retain the value for 2x the freshness window so it can be served stale
    // while a refresh runs.
    await cache.set(key, ttl * 2, JSON.stringify(envelope))
    return value
  }

  if (raw) {
    let envelope: CacheEnvelope<T> | null = null
    try {
      const parsed = JSON.parse(raw)
      // Tolerate legacy entries written before the envelope format.
      envelope = parsed && typeof parsed === 'object' && 'freshUntil' in parsed
        ? (parsed as CacheEnvelope<T>)
        : { freshUntil: 0, value: parsed as T }
    } catch {
      envelope = null
    }

    if (envelope) {
      if (envelope.freshUntil > Date.now()) return envelope.value
      // Stale: serve it now, refresh in the background (deduped via computeOnce).
      void store().catch(() => {})
      return envelope.value
    }
  }

  // No usable cached value — first load must wait for the compute.
  return store()
}
