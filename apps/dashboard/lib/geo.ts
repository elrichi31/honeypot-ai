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
