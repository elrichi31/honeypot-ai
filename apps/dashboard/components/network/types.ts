import type { Sensor } from "@/lib/api"

export type Group = {
  key: string
  name: string
  slug: string | null
  external: Sensor[]
  internal: Sensor[]
}

export type SensorNode = {
  sensor: Sensor
  x: number
  y: number
  clientKey: string
}

export type Cluster = {
  key: string
  name: string
  cx: number
  extX1: number
  extX2: number
  intX1: number
  intX2: number
  hasInt: boolean
}

export type Layout = {
  internet: { x: number; y: number }
  extNodes: SensorNode[]
  intNodes: SensorNode[]
  clusters: Cluster[]
}

export type Transform = {
  x: number
  y: number
  scale: number
}
