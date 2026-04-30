declare module "react-simple-maps" {
  import { CSSProperties, MouseEvent, ReactNode } from "react"

  interface ProjectionConfig {
    scale?: number
    center?: [number, number]
    rotate?: [number, number, number]
  }

  interface ComposableMapProps {
    projection?: string
    projectionConfig?: ProjectionConfig
    width?: number
    height?: number
    style?: CSSProperties
    className?: string
    children?: ReactNode
  }

  interface ZoomableGroupProps {
    zoom?: number
    center?: [number, number]
    minZoom?: number
    maxZoom?: number
    onMoveEnd?: (position: { coordinates: [number, number]; zoom: number }) => void
    onMoveStart?: (position: { coordinates: [number, number]; zoom: number }) => void
    children?: ReactNode
  }

  interface Geography {
    rsmKey: string
    id: string | number
    properties: Record<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }

  interface GeographiesChildrenProps {
    geographies: Geography[]
  }

  interface GeographiesProps {
    geography: string | object
    children: (props: GeographiesChildrenProps) => ReactNode
  }

  interface GeographyStyle {
    default?: CSSProperties
    hover?: CSSProperties
    pressed?: CSSProperties
  }

  interface GeographyProps {
    geography: Geography
    fill?: string
    stroke?: string
    strokeWidth?: number
    style?: GeographyStyle
    className?: string
    onMouseEnter?: (event: MouseEvent<SVGPathElement>) => void
    onMouseLeave?: (event: MouseEvent<SVGPathElement>) => void
    onClick?: (event: MouseEvent<SVGPathElement>) => void
    tabIndex?: number
  }

  interface MarkerProps {
    coordinates: [number, number]
    children?: ReactNode
    style?: CSSProperties
    className?: string
  }

  export function ComposableMap(props: ComposableMapProps): JSX.Element
  export function ZoomableGroup(props: ZoomableGroupProps): JSX.Element
  export function Geographies(props: GeographiesProps): JSX.Element
  export function Geography(props: GeographyProps): JSX.Element
  export function Marker(props: MarkerProps): JSX.Element
}
