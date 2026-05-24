"use client"

import { useMemo } from "react"
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps"
import { getProtocolMarkerColor } from "@/lib/protocol-colors"
import { NUM_TO_ISO2 } from "@/components/live-attack-country"
import type { CountryHit, HoverCountry, LiveArc, SensorLocation } from "@/components/live-attack-map-types"

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

interface Props {
  visible: boolean
  sensors: SensorLocation[]
  countryHits: CountryHit[]
  liveArcs: LiveArc[]
  setHoverCountry: (country: HoverCountry | null) => void
}

export function LiveAttackMap2D({ visible, sensors, countryHits, liveArcs, setHoverCountry }: Props) {
  const countryHitMap = useMemo(
    () => new Map(countryHits.map((hit) => [hit.country, hit])),
    [countryHits],
  )
  const primary = sensors[0]
  return (
    <div className="absolute inset-0" style={{ display: visible ? "block" : "none" }} onMouseLeave={() => setHoverCountry(null)}>
      <ComposableMap projection="geoMercator" style={{ width: "100%", height: "100%" }} projectionConfig={{ scale: 130, center: [10, 25] }}>
        <MapFilters />
        <ZoomableGroup>
          <CountryGeographies countryHitMap={countryHitMap} setHoverCountry={setHoverCountry} />
          {primary && liveArcs.map((arc) => (
            <LiveArcLine key={arc.id} src={[arc.srcLng, arc.srcLat]} dst={[primary.lng, primary.lat]} type={arc.type} />
          ))}
          {sensors.map((sensor) => <SensorMarker key={sensor.ip} sensor={sensor} />)}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  )
}

function MapFilters() {
  return (
    <defs>
      <filter id="arc-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="dot-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  )
}

function CountryGeographies({ countryHitMap, setHoverCountry }: {
  countryHitMap: Map<string, CountryHit>
  setHoverCountry: (country: HoverCountry | null) => void
}) {
  return (
    <Geographies geography={GEO_URL}>
      {({ geographies }) => geographies.map((geo) => {
        const countryCode = NUM_TO_ISO2[Number(geo.id)]
        const hit = countryCode ? countryHitMap.get(countryCode) : undefined
        return (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            fill={hit ? "rgba(244,63,94,0.18)" : "#0d1526"}
            stroke={hit ? "rgba(244,63,94,0.5)" : "#1a2540"}
            strokeWidth={hit ? 0.5 : 0.3}
            onMouseEnter={() => setHoverCountry(hit && countryCode ? { country: countryCode, count: hit.count } : null)}
            onMouseLeave={() => setHoverCountry(null)}
            style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }}
          />
        )
      })}
    </Geographies>
  )
}

function SensorMarker({ sensor }: { sensor: SensorLocation }) {
  return (
    <Marker coordinates={[sensor.lng, sensor.lat]}>
      <title>{`Honeypot ${sensor.ip}`}</title>
      <circle r={0} fill="none" stroke="#22d3ee" strokeWidth={1.2} opacity={0}>
        <animate attributeName="r" from="6" to="22" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.6" to="0" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle r={4.5} fill="#22d3ee" opacity={0.9} filter="url(#dot-glow)" />
      <circle r={2} fill="#fff" opacity={0.9} />
    </Marker>
  )
}

function LiveArcLine({ src, dst, type }: { src: [number, number]; dst: [number, number]; type: string }) {
  const d = arcPath(src, dst)
  if (!d) return null
  const color = getProtocolMarkerColor(type)
  return (
    <g>
      <path d={d} stroke={color} strokeWidth={1.15} fill="none" opacity={0.22} />
      <AnimatedArcPath d={d} color={color} strokeWidth={6} opacity="0;0.5;0" />
      <AnimatedArcPath d={d} color={color} strokeWidth={2.4} opacity="0;0.95;0" />
    </g>
  )
}

function AnimatedArcPath({ d, color, strokeWidth, opacity }: { d: string; color: string; strokeWidth: number; opacity: string }) {
  return (
    <path d={d} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray="8 700" filter={strokeWidth > 3 ? "url(#arc-glow)" : undefined} opacity={0}>
      <animate attributeName="stroke-dashoffset" from="8" to="-700" dur="4.8s" fill="freeze" />
      <animate attributeName="opacity" begin="0s" dur="4.8s" fill="freeze" calcMode="spline" keyTimes="0;0.6;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" values={opacity} />
    </path>
  )
}

function arcPath(src: [number, number], dst: [number, number]): string | null {
  const [x1, y1] = project(src)
  const [x2, y2] = project(dst)
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 3) return null
  const off = Math.min(len * 0.28, 60)
  const cx = (x1 + x2) / 2 - (dy / len) * off
  const cy = (y1 + y2) / 2 + (dx / len) * off
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

function project(coords: [number, number]): [number, number] {
  const [lng, lat] = coords
  const toRad = Math.PI / 180
  const rawX = lng * toRad
  const rawY = -Math.log(Math.tan(Math.PI / 4 + (lat * toRad) / 2))
  const rawCX = 10 * toRad
  const rawCY = -Math.log(Math.tan(Math.PI / 4 + (25 * toRad) / 2))
  return [130 * (rawX - rawCX) + 400, 130 * (rawY - rawCY) + 300]
}
