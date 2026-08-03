import type { ReportSensorProfile, ReportWebProfile } from "../types"

function mergeCounts(lists: { label: string; count: number }[][]) {
  const totals = new Map<string, number>()
  for (const list of lists) {
    for (const item of list) totals.set(item.label, (totals.get(item.label) ?? 0) + item.count)
  }
  return [...totals.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

/** Sums the web profiles of every HTTP decoy so the client reads one web story
 *  instead of one per sensor. Per-sensor detail still has its own section. */
export function mergeWebProfiles(sensors: ReportSensorProfile[]): ReportWebProfile | null {
  const profiles = sensors.map((s) => s.web).filter((w): w is ReportWebProfile => Boolean(w))
  if (profiles.length === 0) return null
  if (profiles.length === 1) return profiles[0]

  const sum = (pick: (w: ReportWebProfile) => number) => profiles.reduce((acc, w) => acc + pick(w), 0)
  const attackTypes = mergeCounts(profiles.map((w) => w.topAttackTypes))

  return {
    hits: sum((w) => w.hits),
    uniquePaths: sum((w) => w.uniquePaths),
    // Counted from the merged list, not summed: the same attack type seen on
    // two decoys is one attack type, not two.
    attackTypeCount: attackTypes.length,
    sessionCount: sum((w) => w.sessionCount),
    fingerprintedSessions: sum((w) => w.fingerprintedSessions),
    multiIpSessions: sum((w) => w.multiIpSessions),
    canaryHits: sum((w) => w.canaryHits),
    chainHits: sum((w) => w.chainHits),
    topAttackTypes: attackTypes.slice(0, 8),
    topPaths: mergeCounts(profiles.map((w) => w.topPaths)).slice(0, 12),
    topMethods: mergeCounts(profiles.map((w) => w.topMethods)).slice(0, 6),
    topUserAgents: mergeCounts(profiles.map((w) => w.topUserAgents)).slice(0, 8),
    topCanaryTokens: mergeCounts(profiles.map((w) => w.topCanaryTokens)).slice(0, 8),
    topSessions: profiles.flatMap((w) => w.topSessions).sort((a, b) => b.hits - a.hits).slice(0, 8),
  }
}
