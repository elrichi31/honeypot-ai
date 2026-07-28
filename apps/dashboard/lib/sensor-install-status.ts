// A deception node registers with protocol='deception' and its real service in
// realProtocol (see upsertHeartbeat in ingest-api); an external sensor keeps its
// own protocol and a null realProtocol. So `protocol` alone can't tell an
// external SMB honeypot from an internal SMB decoy — matching on it marked every
// internal entry as installed as soon as its external twin existed.
export function isSensorInstalled(
  entry: { protocol: string; category: "external" | "deception" },
  sensors: Array<{ protocol: string; realProtocol?: string | null }>,
): boolean {
  if (entry.category !== "deception") {
    return sensors.some((s) => s.protocol === entry.protocol && !s.realProtocol)
  }
  // OpenCanary registers as a plain 'deception' sensor (no realProtocol); the
  // int-* decoys carry their service there.
  const expected = entry.protocol === "deception" ? null : entry.protocol
  return sensors.some((s) => s.protocol === "deception" && (s.realProtocol ?? null) === expected)
}
