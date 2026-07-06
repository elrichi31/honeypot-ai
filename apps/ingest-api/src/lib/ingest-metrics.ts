// In-memory ingest metrics (PERF_AUDIT.md M3). Answers the question A2/D2 left
// open — "is the current hot-path throughput a real bottleneck?" — with actual
// numbers instead of guessing. No external deps: a fixed-size ring buffer of
// recent latencies is enough for p50/p99 at this volume, and resets on restart
// (fine — this is a live diagnostic, not a durable metric store).

const LATENCY_WINDOW_SIZE = 1000

class LatencyRingBuffer {
  private samples: number[] = []
  private index = 0

  record(ms: number): void {
    if (this.samples.length < LATENCY_WINDOW_SIZE) {
      this.samples.push(ms)
    } else {
      this.samples[this.index] = ms
    }
    this.index = (this.index + 1) % LATENCY_WINDOW_SIZE
  }

  percentile(p: number): number | null {
    if (this.samples.length === 0) return null
    const sorted = [...this.samples].sort((a, b) => a - b)
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
    return sorted[idx]
  }

  get count(): number {
    return this.samples.length
  }

  reset(): void {
    this.samples = []
    this.index = 0
  }
}

const processLineLatency = new LatencyRingBuffer()

let eventsProcessedTotal = 0
let windowStart = Date.now()
let windowCount = 0
let lastEventsPerSecond = 0

// Recomputed on read rather than on a timer — cheap (single division) and
// avoids an extra setInterval to manage/clear on shutdown.
const RATE_WINDOW_MS = 10_000

export function recordProcessLineLatency(ms: number): void {
  processLineLatency.record(ms)
  eventsProcessedTotal++
  windowCount++

  const elapsed = Date.now() - windowStart
  if (elapsed >= RATE_WINDOW_MS) {
    lastEventsPerSecond = windowCount / (elapsed / 1000)
    windowCount = 0
    windowStart = Date.now()
  }
}

export function getIngestMetrics() {
  return {
    eventsProcessedTotal,
    eventsPerSecond: Math.round(lastEventsPerSecond * 100) / 100,
    processLineLatencyMs: {
      p50: processLineLatency.percentile(50),
      p99: processLineLatency.percentile(99),
      sampleCount: processLineLatency.count,
    },
  }
}

// Test-only: reset module state between test files.
export function __resetIngestMetricsForTest(): void {
  eventsProcessedTotal = 0
  windowStart = Date.now()
  windowCount = 0
  lastEventsPerSecond = 0
  processLineLatency.reset()
}
