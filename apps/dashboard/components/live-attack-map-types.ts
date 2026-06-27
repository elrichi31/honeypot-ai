export type ViewMode = "2d" | "3d"

export interface SensorLocation {
  sensorId: string
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
  targetSensorId?: string | null
  expiresAt: number
}

export interface GlobeArc {
  id: string
  srcLat: number
  srcLng: number
  type: string
  targetSensorId?: string | null
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
  sensorId?: string | null
  dstPort?: number
}

export interface RawEvent {
  type: string
  ip: string
  lat: number
  lng: number
  country: string
  timestamp: string
  sensorId?: string | null
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
