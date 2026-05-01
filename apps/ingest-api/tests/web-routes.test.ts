import { describe, expect, it } from 'vitest'
import { normalizeHeaders } from '../src/routes/web.js'

describe('normalizeHeaders', () => {
  it('converts array-based headers from Galah into plain strings', () => {
    expect(
      normalizeHeaders({
        'User-Agent': ['curl/8.8.0'],
        Accept: ['*/*', 'application/json'],
        'Content-Length': 42,
        DNT: true,
      })
    ).toEqual({
      'User-Agent': 'curl/8.8.0',
      Accept: '*/*, application/json',
      'Content-Length': '42',
      DNT: 'true',
    })
  })

  it('returns an empty object for invalid header payloads', () => {
    expect(normalizeHeaders(null)).toEqual({})
    expect(normalizeHeaders('x')).toEqual({})
    expect(normalizeHeaders(['x-test'])).toEqual({})
  })
})
