import geoip from 'geoip-lite'

export interface GeoPoint {
  lat: number
  lng: number
  country: string
  city?: string
  org?: string
}

export function lookupGeo(ip: string): GeoPoint | null {
  const geo = geoip.lookup(ip)
  if (!geo?.ll) return null
  return {
    lat: geo.ll[0],
    lng: geo.ll[1],
    country: geo.country ?? '',
    city: geo.city || undefined,
    org: (geo as unknown as Record<string, string>).org || undefined,
  }
}
