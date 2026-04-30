import geoip from 'geoip-lite'

export interface GeoPoint {
  lat: number
  lng: number
  country: string
}

export function lookupGeo(ip: string): GeoPoint | null {
  const geo = geoip.lookup(ip)
  if (!geo?.ll) return null
  return { lat: geo.ll[0], lng: geo.ll[1], country: geo.country ?? '' }
}
