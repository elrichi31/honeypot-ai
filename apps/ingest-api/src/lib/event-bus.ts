import { EventEmitter } from 'events'

export type AttackType = string

export interface AttackEvent {
  type: AttackType
  ip: string
  lat: number
  lng: number
  country: string
  timestamp: string
  sensorId?: string | null
  dstPort?: number
}

export interface AlertEvent {
  type: 'alert'
  level: string
  title: string
  srcIp: string | null
  sensorId: string | null
  timestamp: string
}

export interface SensorHeartbeatEvent {
  type: 'sensor-heartbeat'
  sensorId: string
  timestamp: string
}

export type LiveEvent = AttackEvent | AlertEvent | SensorHeartbeatEvent

class EventBus extends EventEmitter {}

export const eventBus = new EventBus()
eventBus.setMaxListeners(200)
