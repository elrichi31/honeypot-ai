import { describe, expect, it } from 'vitest'
import { reportedPortStatus } from '../src/lib/sensor-queries.js'
import type { SensorRow } from '../src/lib/sensor-queries.js'

function row(port_status: SensorRow['port_status']): SensorRow {
  return { port_status } as SensorRow
}

describe('reportedPortStatus', () => {
  it('returns null when the sensor reports nothing (old sensor → server probe)', () => {
    expect(reportedPortStatus(row(null))).toBeNull()
    expect(reportedPortStatus(row({}))).toBeNull()
  })

  it('coerces string JSON keys to numbers so the UI can index by port', () => {
    expect(reportedPortStatus(row({ '3389': true, '5900': false }))).toEqual({ 3389: true, 5900: false })
  })

  it('drops non-numeric keys but keeps valid ones', () => {
    expect(reportedPortStatus(row({ '22': true, bogus: true }))).toEqual({ 22: true })
  })
})
