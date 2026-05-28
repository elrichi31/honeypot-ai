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
      <filter id="arc-glow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="5" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="arc-glow-outer" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="10" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="dot-glow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="3" result="blur" />
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
      {/* Outer slow pulse */}
      <circle r={0} fill="none" stroke="#22d3ee" strokeWidth={0.8} opacity={0}>
        <animate attributeName="r" from="8" to="28" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.5" to="0" dur="3s" repeatCount="indefinite" />
      </circle>
      {/* Inner fast pulse */}
      <circle r={0} fill="none" stroke="#22d3ee" strokeWidth={1.4} opacity={0}>
        <animate attributeName="r" from="5" to="16" dur="2s" repeatCount="indefinite" begin="0.6s" />
        <animate attributeName="opacity" from="0.7" to="0" dur="2s" repeatCount="indefinite" begin="0.6s" />
      </circle>
      <circle r={5} fill="#22d3ee" opacity={0.95} filter="url(#dot-glow)" />
      <circle r={2.5} fill="#fff" opacity={0.95} />
    </Marker>
  )
}

function LiveArcLine({ src, dst, type }: { src: [number, number]; dst: [number, number]; type: string }) {
  const d = arcPath(src, dst)
  if (!d) return null
  const color = getProtocolMarkerColor(type)
  const DUR = "3.2s"
  return (
    <g>
      {/* Static faint trail */}
      <path d={d} stroke={color} strokeWidth={0.3} fill="none" opacity={0.12} strokeLinecap="round" />

      {/* Subtle glow */}
      <path d={d} pathLength="1" stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
        filter="url(#arc-glow)" strokeDasharray="0.3 0.7" opacity={0}>
        <animate attributeName="stroke-dashoffset" from="0.3" to="-0.7" dur={DUR} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.35;0" keyTimes="0;0.5;1" dur={DUR} repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
      </path>

      {/* Bright colored core */}
      <path d={d} pathLength="1" stroke={color} strokeWidth={0.9} fill="none" strokeLinecap="round"
        strokeDasharray="0.28 0.72" opacity={0}>
        <animate attributeName="stroke-dashoffset" from="0.28" to="-0.72" dur={DUR} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.95;0" keyTimes="0;0.5;1" dur={DUR} repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
      </path>

      {/* White-hot leading tip */}
      <path d={d} pathLength="1" stroke="#ffffff" strokeWidth={0.4} fill="none" strokeLinecap="round"
        strokeDasharray="0.08 0.92" opacity={0}>
        <animate attributeName="stroke-dashoffset" from="0.24" to="-0.76" dur={DUR} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.75;0" keyTimes="0;0.5;1" dur={DUR} repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
      </path>
    </g>
  )
}

function arcPath(src: [number, number], dst: [number, number]): string | null {
  const [x1, y1] = project(src)
  const [x2, y2] = project(dst)
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 3) return null
  const off = Math.min(len * 0.42, 95)
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
