import { describe, expect, it, beforeEach } from 'vitest'
import { recordProcessLineLatency, getIngestMetrics, __resetIngestMetricsForTest } from '../src/lib/ingest-metrics.js'

describe('ingest-metrics', () => {
  beforeEach(() => {
    __resetIngestMetricsForTest()
  })

  it('starts with no samples', () => {
    const metrics = getIngestMetrics()
    expect(metrics.eventsProcessedTotal).toBe(0)
    expect(metrics.processLineLatencyMs.p50).toBeNull()
    expect(metrics.processLineLatencyMs.p99).toBeNull()
  })

  it('tracks eventsProcessedTotal across calls', () => {
    recordProcessLineLatency(5)
    recordProcessLineLatency(10)
    recordProcessLineLatency(15)
    expect(getIngestMetrics().eventsProcessedTotal).toBe(3)
  })

  it('computes p50/p99 from recorded latencies', () => {
    // 1..100 ms — p50 should land near the middle, p99 near the top.
    for (let i = 1; i <= 100; i++) recordProcessLineLatency(i)
    const { p50, p99, sampleCount } = getIngestMetrics().processLineLatencyMs
    expect(sampleCount).toBe(100)
    expect(p50).toBeGreaterThanOrEqual(45)
    expect(p50).toBeLessThanOrEqual(55)
    expect(p99).toBeGreaterThanOrEqual(95)
  })

  it('is not skewed by insertion order (ring buffer sorts on read)', () => {
    recordProcessLineLatency(100)
    recordProcessLineLatency(1)
    recordProcessLineLatency(50)
    const { p50 } = getIngestMetrics().processLineLatencyMs
    expect(p50).toBe(50)
  })

  it('overwrites the oldest sample once the ring buffer window is full', () => {
    // Window size is 1000 — fill it entirely, then overwrite the first 20
    // (oldest) entries with a high outlier. p99 (top 1%, ~10 samples) must
    // reflect the outlier, proving old samples were evicted, not appended
    // without bound.
    for (let i = 0; i < 1000; i++) recordProcessLineLatency(0)
    for (let i = 0; i < 20; i++) recordProcessLineLatency(1000)
    const { p99, sampleCount } = getIngestMetrics().processLineLatencyMs
    expect(sampleCount).toBe(1000)
    expect(p99).toBe(1000)
  })
})
