import { format } from "date-fns"

export interface ActivityBucket {
  label: string
  count: number
}

/** Bin timestamps into `bucketCount` equal time slices spanning first→last. */
export function buildActivityBuckets(
  timestamps: string[],
  bucketCount = 24,
  labelFormat = "MMM d HH:mm",
): ActivityBucket[] {
  if (timestamps.length === 0) return []
  const times = timestamps.map((t) => new Date(t).getTime()).sort((a, b) => a - b)
  const minT = times[0]
  const maxT = times[times.length - 1]
  const span = maxT - minT || 1
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    start: minT + (span / bucketCount) * i,
    label: "",
    count: 0,
  }))
  for (const t of times) {
    const idx = Math.min(bucketCount - 1, Math.floor(((t - minT) / span) * bucketCount))
    buckets[idx].count++
  }
  return buckets.map((b) => ({ label: format(new Date(b.start), labelFormat), count: b.count }))
}
