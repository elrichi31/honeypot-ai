import { describe, expect, it } from 'vitest'
import { isInternalIp } from '../src/lib/internal-ip.js'

describe('isInternalIp', () => {
  it.each([
    '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '127.0.0.1', '169.254.1.1', '100.64.0.1', '100.127.255.255',
    '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:10.0.0.1',
  ])('identifies %s as internal', (ip) => {
    expect(isInternalIp(ip)).toBe(true)
  })

  it.each([
    '8.8.8.8', '172.15.255.255', '172.32.0.1', '100.63.255.255',
    '100.128.0.1', '2001:4860:4860::8888', 'not-an-ip', '',
  ])('does not exclude public or malformed value %s', (ip) => {
    expect(isInternalIp(ip)).toBe(false)
  })
})
