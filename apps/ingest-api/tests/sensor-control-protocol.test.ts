import { describe, expect, it } from 'vitest'
import {
  SENSOR_CONTROL_PROTOCOL_VERSION,
  sensorControlClientMessageSchema,
  sensorControlCommandSchema,
  sensorControlServerMessageSchema,
} from '../src/contracts/sensor-control/protocol.js'

const messageId = '3c0b2a31-7073-4d1e-8e1f-7c22c4d0a701'
const commandId = 'command-20260711-status-001'
const sentAt = '2026-07-11T12:00:00.000Z'

describe('sensor-control protocol v1', () => {
  it('accepts a versioned sensor hello with the initial capability', () => {
    const parsed = sensorControlClientMessageSchema.parse({
      type: 'hello',
      protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
      messageId,
      sentAt,
      sensorId: 'cowrie-01-example',
      agentVersion: '1.0.0',
      capabilities: ['status.get'],
      configHash: null,
    })

    expect(parsed.type).toBe('hello')
  })

  it('accepts a status.get command and rejects extra payload fields', () => {
    const command = {
      type: 'command',
      protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
      messageId,
      sentAt,
      commandId,
      sensorId: 'cowrie-01-example',
      action: 'status.get',
      payload: {},
      expiresAt: '2026-07-11T12:01:00.000Z',
    }

    expect(sensorControlCommandSchema.parse(command).action).toBe('status.get')
    expect(sensorControlCommandSchema.safeParse({ ...command, payload: { shell: 'id' } }).success).toBe(false)
  })

  it('rejects unknown message fields and commands outside the initial capability set', () => {
    const baseCommand = {
      type: 'command',
      protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
      messageId,
      sentAt,
      commandId,
      sensorId: 'cowrie-01-example',
      action: 'status.get',
      payload: {},
      expiresAt: '2026-07-11T12:01:00.000Z',
    }

    expect(sensorControlServerMessageSchema.safeParse({ ...baseCommand, unexpected: true }).success).toBe(false)
    expect(sensorControlServerMessageSchema.safeParse({ ...baseCommand, action: 'service.restart' }).success).toBe(false)
  })

  it('requires a structured error when a command is rejected', () => {
    const baseAck = {
      type: 'command.ack',
      protocolVersion: SENSOR_CONTROL_PROTOCOL_VERSION,
      messageId,
      sentAt,
      commandId,
      sensorId: 'cowrie-01-example',
      accepted: false,
    }

    expect(sensorControlClientMessageSchema.safeParse(baseAck).success).toBe(false)
    expect(sensorControlClientMessageSchema.safeParse({
      ...baseAck,
      error: { code: 'COMMAND_EXPIRED', message: 'Command TTL elapsed', retryable: false },
    }).success).toBe(true)
  })
})
