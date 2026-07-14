import type { SensorControlServerMessage } from '../../contracts/sensor-control/protocol.js'

export interface SensorControlConnection {
  sensorId: string
  connectionId: string
  connectedAt: Date
  agentVersion: string
  capabilities: string[]
  send(message: SensorControlServerMessage): void
  close(code: number, reason: string): void
}

export interface SensorConnectionRegistry {
  register(connection: SensorControlConnection): void
  unregister(sensorId: string, connectionId: string): void
  get(sensorId: string): SensorControlConnection | undefined
  has(sensorId: string): boolean
}

/**
 * In-memory registry. Correct ONLY when ingest-api runs as a single instance
 * (the current production topology — see docs/plans/SENSOR_REMOTE_CONTROL.md,
 * Rebanada 2). If ingest-api is ever horizontally scaled, a socket registered
 * on replica A is invisible to replica B, so a command targeting a sensor
 * connected to A would appear "not connected" from B.
 *
 * Extension point for multi-instance: implement this same interface backed by
 * Redis pub/sub (publish "deliver to sensorId X" on a channel; whichever
 * replica holds that socket delivers and acks) or a broker. Consumers must
 * depend only on the SensorConnectionRegistry interface, never on this
 * concrete class, so swapping implementations requires no change there.
 */
export class InMemorySensorConnectionRegistry implements SensorConnectionRegistry {
  private connections = new Map<string, SensorControlConnection>()

  register(connection: SensorControlConnection): void {
    const existing = this.connections.get(connection.sensorId)
    if (existing && existing.connectionId !== connection.connectionId) {
      existing.close(4000, 'replaced_by_new_connection')
    }
    this.connections.set(connection.sensorId, connection)
  }

  // Compare-and-delete on connectionId guards against the old socket's close
  // handler firing AFTER a new connection already replaced it, which would
  // otherwise delete the new, valid entry.
  unregister(sensorId: string, connectionId: string): void {
    const current = this.connections.get(sensorId)
    if (current?.connectionId === connectionId) this.connections.delete(sensorId)
  }

  get(sensorId: string) {
    return this.connections.get(sensorId)
  }

  has(sensorId: string) {
    return this.connections.has(sensorId)
  }
}

export const sensorConnectionRegistry: SensorConnectionRegistry = new InMemorySensorConnectionRegistry()
