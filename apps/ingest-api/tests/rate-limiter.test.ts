import { describe, expect, it } from 'vitest'
import { checkRateLimit } from '../src/lib/ingest-rate-limiter.js'

// Unique keys per test — the window map is module-global with no reset hook.
describe('checkRateLimit', () => {
  it('allows up to the limit, then blocks', () => {
    const key = `t1-${Math.random()}`
    for (let i = 0; i < 3; i++) expect(checkRateLimit(key, 3)).toBe(true)
    expect(checkRateLimit(key, 3)).toBe(false)
  })

  it('keeps namespaced keys independent (defense vs ingest counters)', () => {
    const ip = `1.2.3.${Math.floor(Math.random() * 255)}`
    // Exhaust the ingest counter for this IP.
    expect(checkRateLimit(ip, 1)).toBe(true)
    expect(checkRateLimit(ip, 1)).toBe(false)
    // The namespaced defense counter for the same IP is untouched.
    expect(checkRateLimit(`def:${ip}`, 1)).toBe(true)
  })
})
