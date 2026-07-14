import { randomUUID } from 'crypto'
import {
  SENSOR_CONTROL_PROTOCOL_VERSION,
  type SensorControlAction,
  type SensorControlCommand,
} from '../../contracts/sensor-control/protocol.js'

export function buildCommandMessage(command: {
  id: string
  sensorId: string
  action: string
  payload: unknown
  expiresAt: Date
}): SensorControlCommand {
  return {
    protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
    messageId: randomUUID(),
    sentAt: new Date().toISOString(),
    type: 'command',
    commandId: command.id,
    sensorId: command.sensorId,
    action: command.action as SensorControlAction,
    payload: (command.payload ?? {}) as Record<string, unknown>,
    expiresAt: command.expiresAt.toISOString(),
  }
}
