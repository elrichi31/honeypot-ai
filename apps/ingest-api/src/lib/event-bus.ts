import { EventEmitter } from 'events'

export type AttackType = 'ssh' | 'http' | 'ftp' | 'mysql' | 'port-scan'

export interface AttackEvent {
  type: AttackType
  ip: string
  lat: number
  lng: number
  country: string
  timestamp: string
}

class EventBus extends EventEmitter {}

export const eventBus = new EventBus()
eventBus.setMaxListeners(200)
