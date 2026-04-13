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

export function geolocateIps(ips: string[]): CountryAttack[] {
  const geo = getGeoip()
  const counts = new Map<string, number>()

  for (const ip of ips) {
    const result = geo.lookup(ip)
    if (result?.country) {
      counts.set(result.country, (counts.get(result.country) || 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .map(([country, count]) => ({
      country,
      name: countryNames.of(country) ?? country,
      count,
    }))
    .sort((a, b) => b.count - a.count)
}
