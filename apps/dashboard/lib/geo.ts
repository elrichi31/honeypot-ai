import type { CountryAttack } from "./types"

// This file is server-only — geoip-lite uses Node.js fs and must not be bundled for the client
let geoip: typeof import("geoip-lite") | null = null

function getGeoip() {
  if (!geoip) {
    geoip = require("geoip-lite")
  }
  return geoip!
}

const countryNames = new Intl.DisplayNames(["en"], { type: "region" })

export function lookupIp(ip: string): { country: string; countryName: string } | null {
  const result = getGeoip().lookup(ip)
  if (!result?.country) return null
  return {
    country: result.country,
    countryName: countryNames.of(result.country) ?? result.country,
  }
}

export interface WebCountryAttack {
  country:     string
  name:        string
  uniqueIps:   number
  totalHits:   number
  topType:     string    // attack type más frecuente
}

export function geolocateWebHits(
  attackers: { srcIp: string; totalHits: number; attackTypes: string[] }[],
): WebCountryAttack[] {
  const geo  = getGeoip()
  const data = new Map<string, { ips: Set<string>; hits: number; typeCounts: Record<string, number> }>()

  for (const a of attackers) {
    const result = geo.lookup(a.srcIp)
    if (!result?.country) continue

    if (!data.has(result.country)) {
      data.set(result.country, { ips: new Set(), hits: 0, typeCounts: {} })
    }
    const entry = data.get(result.country)!
    entry.ips.add(a.srcIp)
    entry.hits += a.totalHits
    for (const t of a.attackTypes) {
      entry.typeCounts[t] = (entry.typeCounts[t] ?? 0) + 1
    }
  }

  return Array.from(data.entries())
    .map(([country, { ips, hits, typeCounts }]) => ({
      country,
      name:      countryNames.of(country) ?? country,
      uniqueIps: ips.size,
      totalHits: hits,
      topType:   Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "recon",
    }))
    .sort((a, b) => b.totalHits - a.totalHits)
}

export function geolocateIps(
  sessions: { srcIp: string; loginSuccess?: boolean | null }[],
): CountryAttack[] {
  const geo = getGeoip()
  const data = new Map<string, { ips: Set<string>; sessions: number; successfulLogins: number }>()

  for (const s of sessions) {
    const result = geo.lookup(s.srcIp)
    if (!result?.country) continue

    if (!data.has(result.country)) {
      data.set(result.country, { ips: new Set(), sessions: 0, successfulLogins: 0 })
    }
    const entry = data.get(result.country)!
    entry.ips.add(s.srcIp)
    entry.sessions++
    if (s.loginSuccess === true) entry.successfulLogins++
  }

  return Array.from(data.entries())
    .map(([country, { ips, sessions, successfulLogins }]) => ({
      country,
      name: countryNames.of(country) ?? country,
      count: ips.size,
      sessions,
      successfulLogins,
    }))
    .sort((a, b) => b.sessions - a.sessions)
}
