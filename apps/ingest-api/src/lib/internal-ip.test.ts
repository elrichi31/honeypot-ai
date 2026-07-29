import { describe, it, expect } from 'vitest'
import { isInternalIp, isInternalLayerData } from './internal-ip.js'

describe('isInternalIp', () => {
  it('flags private / CGNAT / loopback ranges', () => {
    for (const ip of ['10.0.1.5', '192.168.100.252', '172.16.4.4', '127.0.0.1', '100.79.15.99', '::1', 'fd00::1']) {
      expect(isInternalIp(ip)).toBe(true)
    }
  })

  it('passes public IPs through', () => {
    for (const ip of ['186.101.142.6', '8.8.8.8', '1.1.1.1', '172.15.0.1', '100.63.0.1']) {
      expect(isInternalIp(ip)).toBe(false)
    }
  })
})

describe('isInternalLayerData', () => {
  it('recognizes deception markers so internal-source events survive the drop', () => {
    expect(isInternalLayerData({ layer: 'internal' })).toBe(true)
    expect(isInternalLayerData({ source: 'opencanary' })).toBe(true)
  })

  it('does not treat external events as deception', () => {
    expect(isInternalLayerData({ layer: 'external' })).toBe(false)
    expect(isInternalLayerData({})).toBe(false)
    expect(isInternalLayerData(null)).toBe(false)
    expect(isInternalLayerData(undefined)).toBe(false)
  })
})
