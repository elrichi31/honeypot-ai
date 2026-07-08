import type { FastifyInstance } from 'fastify'

type Cache = FastifyInstance['cache']

interface CacheEnvelope<T> {
  freshUntil: number
  value: T
}

// Retain values far longer than any freshness window so a quiet dashboard
// (no visits for 20-40 min) never goes fully cold: a value from hours ago,
// served instantly while it refreshes in the background, beats a
// `SectionError` every time. See docs/plans/DASHBOARD_FIRST_LOAD.md Fase 1.
const RETENTION_TTL_SECONDS = 24 * 60 * 60

// Above this, a compute is slow enough to be worth flagging — cold-cache
// stampedes against the replica pool are the expected cause.
const SLOW_COMPUTE_MS = 5000

// In-flight computations, keyed by cache key, so concurrent requests for the
// same key don't each kick off the (heavy) compute. The first one runs it; the
// rest await the same promise.
const inFlight = new Map<string, Promise<unknown>>()

// Global concurrency limit across *all* keys, not just per-key dedup: a cold
// dashboard load fires 8-15 distinct cache keys at once, each a heavy query
// against the replica (connection_limit=10). Without this, they all queue on
// the pool simultaneously and time out together. With it, a cold load
// degrades to "loads progressively" instead of "half the sections error".
const MAX_CONCURRENT_COMPUTES = 4
let activeComputes = 0
const computeQueue: Array<() => void> = []

function acquireComputeSlot(): Promise<void> {
  if (activeComputes < MAX_CONCURRENT_COMPUTES) {
    activeComputes++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    computeQueue.push(() => {
      activeComputes++
      resolve()
    })
  })
}

function releaseComputeSlot(): void {
  activeComputes--
  const next = computeQueue.shift()
  if (next) next()
}

async function runThrottled<T>(compute: () => Promise<T>): Promise<T> {
  await acquireComputeSlot()
  try {
    return await compute()
  } finally {
    releaseComputeSlot()
  }
}

function computeOnce<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>
  const started = Date.now()
  const promise = runThrottled(compute)
    .then((value) => {
      const elapsed = Date.now() - started
      if (elapsed > SLOW_COMPUTE_MS) {
        console.warn(`[cache] slow compute for "${key}": ${elapsed}ms`)
      }
      return value
    })
    .catch((err) => {
      const elapsed = Date.now() - started
      const code = err?.code ? ` code=${err.code}` : ''
      console.error(`[cache] compute failed for "${key}" after ${elapsed}ms${code}: ${err?.message ?? err}`)
      throw err
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

/**
 * Cache with stale-while-revalidate semantics.
 *
 * Once a key has been computed once, callers never block on the heavy compute
 * again: a stale-but-present value is returned immediately while a single
 * background recompute refreshes it. Only the very first request (no value at
 * all) waits for the compute. The physical TTL (`RETENTION_TTL_SECONDS`) is
 * kept much longer than the freshness window so the stale value survives long
 * quiet periods (a whole night) instead of expiring and forcing a cold start.
 *
 * This keeps expensive dashboard aggregates (8+ queries) from ever surfacing as
 * a timeout once the cache is warm.
 */
export async function withCache<T>(
  cache: Cache,
  key: string,
  ttl: number,
  compute: () => Promise<T>,
  /**
   * Optional value to return immediately on a cold miss instead of blocking on
   * `compute`. When provided, the first request never waits: it returns this
   * fallback and kicks off the compute in the background to warm the cache for
   * the next request. Use for compute that is acceptable to skip once (e.g. TCP
   * port probes), not for data the caller strictly needs.
   */
  coldFallback?: T,
  /**
   * On a cold miss, wait up to this many ms for `compute` before giving up and
   * returning `coldFallback` (the compute keeps running in the background to
   * warm the cache). Lets the first load surface real data when the compute is
   * usually fast — e.g. local TCP probes — while still capping latency for the
   * slow/unreachable case. Only used together with `coldFallback`.
   */
  coldWaitMs?: number,
): Promise<T> {
  if (!cache) return compute()

  const raw = await cache.get(key)

  const store = async (): Promise<T> => {
    const value = await computeOnce(key, compute)
    const envelope: CacheEnvelope<T> = { freshUntil: Date.now() + ttl * 1000, value }
    await cache.set(key, RETENTION_TTL_SECONDS, JSON.stringify(envelope))
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

  // No usable cached value. With a cold fallback, return it now and warm the
  // cache in the background; otherwise the first load must wait for the compute.
  if (coldFallback !== undefined) {
    const pending = store()
    pending.catch(() => {})
    // Give a fast compute a brief chance to finish so the first load gets real
    // data instead of the placeholder; fall back if it doesn't make the cap.
    if (coldWaitMs && coldWaitMs > 0) {
      const raced = await Promise.race([
        pending.then((value) => ({ value }), () => ({ value: coldFallback })),
        new Promise<{ value: T }>((resolve) =>
          setTimeout(() => resolve({ value: coldFallback }), coldWaitMs),
        ),
      ])
      return raced.value
    }
    return coldFallback
  }
  return store()
}

/**
 * Drop one or more cache keys. Call after a mutation so the next read recomputes
 * instead of serving a stale (or stale-while-revalidate) value. Also clears any
 * in-flight compute for the key so a refresh started just before the mutation
 * can't repopulate it with pre-mutation data.
 */
export async function invalidate(cache: Cache, ...keys: string[]): Promise<void> {
  if (!cache) return
  await Promise.all(
    keys.map((key) => {
      inFlight.delete(key)
      return cache.del(key)
    }),
  )
}
