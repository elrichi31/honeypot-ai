import { describe, expect, it } from 'vitest'
import { canTransitionSensorCommand } from '../src/modules/sensor-control/sensor-command-state.js'

describe('sensor command state machine', () => {
  it('allows the normal delivery lifecycle', () => {
    expect(canTransitionSensorCommand('queued', 'sent')).toBe(true)
    expect(canTransitionSensorCommand('sent', 'acked')).toBe(true)
    expect(canTransitionSensorCommand('acked', 'running')).toBe(true)
    expect(canTransitionSensorCommand('running', 'succeeded')).toBe(true)
  })

  it('only allows cancellation before delivery', () => {
    expect(canTransitionSensorCommand('queued', 'cancelled')).toBe(true)
    expect(canTransitionSensorCommand('sent', 'cancelled')).toBe(false)
    expect(canTransitionSensorCommand('running', 'cancelled')).toBe(false)
  })

  it('never transitions out of a terminal state', () => {
    expect(canTransitionSensorCommand('succeeded', 'failed')).toBe(false)
    expect(canTransitionSensorCommand('failed', 'queued')).toBe(false)
    expect(canTransitionSensorCommand('expired', 'sent')).toBe(false)
  })

  it('allows a terminal result to skip the running step', () => {
    expect(canTransitionSensorCommand('acked', 'succeeded')).toBe(true)
    expect(canTransitionSensorCommand('acked', 'failed')).toBe(true)
  })

  it('never lets an unacked command jump to running or succeed without an ack', () => {
    expect(canTransitionSensorCommand('sent', 'running')).toBe(false)
    expect(canTransitionSensorCommand('sent', 'succeeded')).toBe(false)
  })

  it('lets a rejected ack (accepted: false) fail a sent command directly', () => {
    expect(canTransitionSensorCommand('sent', 'failed')).toBe(true)
  })

  it('lets a stuck acked or running command expire', () => {
    expect(canTransitionSensorCommand('acked', 'expired')).toBe(true)
    expect(canTransitionSensorCommand('running', 'expired')).toBe(true)
  })
})
