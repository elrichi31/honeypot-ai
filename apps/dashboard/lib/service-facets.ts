import type { ProtocolInsights } from "./api"

export type FacetKey =
  | "credentials" | "usernames" | "commands"
  | "databases" | "shares" | "services" | "ports"

export interface FacetItem { label: string; count: number }
export interface Facet { label: string; items: FacetItem[] }

// Pick the most relevant non-empty facets for a protocol. Order matters: the
// first three with data are what the card shows. Different honeypots populate
// different arrays (SMB → shares, MySQL → databases, FTP → commands), so this
// stays generic instead of branching per protocol.
export function buildServiceFacets(
  insights: ProtocolInsights,
  label: (key: FacetKey) => string,
): Facet[] {
  const all: { key: FacetKey; items: FacetItem[] }[] = [
    { key: "credentials", items: (insights.topCredentials ?? []).map((c) => ({ label: `${c.username || "∅"} / ${c.password || "∅"}`, count: c.count })) },
    { key: "usernames",   items: insights.topUsernames.map((u) => ({ label: u.username || "∅", count: u.count })) },
    { key: "commands",    items: insights.topCommands.map((c) => ({ label: c.command, count: c.count })) },
    { key: "databases",   items: insights.topDatabases.map((d) => ({ label: d.database, count: d.count })) },
    { key: "shares",      items: (insights.topShares ?? []).map((s) => ({ label: s.share, count: s.count })) },
    { key: "services",    items: insights.topServices.map((s) => ({ label: s.service, count: s.count })) },
    { key: "ports",       items: insights.topPorts.map((p) => ({ label: `:${p.dstPort}`, count: p.count })) },
  ]
  // topCredentials already carries username+password, so drop the standalone
  // usernames facet when we have pairs to avoid showing the same data twice.
  const hasCreds = (insights.topCredentials?.length ?? 0) > 0
  return all
    .filter((f) => f.items.length > 0)
    .filter((f) => !(hasCreds && f.key === "usernames"))
    .slice(0, 3)
    .map((f) => ({ label: label(f.key), items: f.items.slice(0, 4) }))
}
