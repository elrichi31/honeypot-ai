export type ViewMode = "2d" | "3d"

export interface SensorLocation {
  ip: string
  protocol: string
  lat: number
  lng: number
  country: string
}

export interface CountryHit {
  country: string
  lat: number
  lng: number
  type: string
  count: number
}

export interface LiveArc {
  id: string
  srcLng: number
  srcLat: number
  type: string
  expiresAt: number
}

export interface GlobeArc {
  id: string
  srcLat: number
  srcLng: number
  type: string
  createdAt: number
}

export interface Attack {
  id: string
  type: string
  ip: string
  lat: number
  lng: number
  country: string
  timestamp: number
  dstPort?: number
}

export interface RawEvent {
  type: string
  ip: string
  lat: number
  lng: number
  country: string
  timestamp: string
  dstPort?: number
}

export interface HoverCountry {
  country: string
  count: number
}

export interface LiveMarkerEntry {
  lat: number
  lng: number
  count: number
  lastHitAt: number
  lastType: string
}
