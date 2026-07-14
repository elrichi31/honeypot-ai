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

export interface SensorConnectedEvent {
  type: 'sensor.connected'
  sensorId: string
  connectionId: string
  agentVersion: string
  capabilities: string[]
  timestamp: string
}

export interface SensorDisconnectedEvent {
  type: 'sensor.disconnected'
  sensorId: string
  connectionId: string
  reason: string
  timestamp: string
}

// Command lifecycle events carry only IDs/status, never the result/error
// payload — /events/live is an unauthenticated broadcast, so sensor internals
// (agent version, ports, config hash) don't belong on it. A consumer that
// needs the full result fetches GET /sensors/:sensorId/commands by commandId.
export interface CommandSentEvent {
  type: 'command.sent'
  commandId: string
  sensorId: string
  action: string
  timestamp: string
}

export interface CommandAckedEvent {
  type: 'command.acked'
  commandId: string
  sensorId: string
  accepted: boolean
  timestamp: string
}

export interface CommandRunningEvent {
  type: 'command.running'
  commandId: string
  sensorId: string
  timestamp: string
}

export interface CommandResultEvent {
  type: 'command.result'
  commandId: string
  sensorId: string
  status: 'succeeded' | 'failed'
  timestamp: string
}

export type LiveEvent =
  | AttackEvent
  | AlertEvent
  | SensorHeartbeatEvent
  | SensorConnectedEvent
  | SensorDisconnectedEvent
  | CommandSentEvent
  | CommandAckedEvent
  | CommandRunningEvent
  | CommandResultEvent

class EventBus extends EventEmitter {}

export const eventBus = new EventBus()
eventBus.setMaxListeners(200)
