import { describe, it, expect } from 'vitest'
import { parseSensorScope, narrowToTenant } from './sensor-scope.js'

describe('narrowToTenant', () => {
  const tenant = (q: string) => parseSensorScope({ sensorIds: q })
  const global = parseSensorScope({})            // no ceiling
  const ab = tenant('a,b')                        // ceiling = {a,b}
  const none = tenant('__none__')                 // fail-closed tenant

  it('global tenant: manual filter passes through untouched', () => {
    expect(narrowToTenant(global, undefined)).toBeUndefined()
    expect(narrowToTenant(global, ['x'])).toEqual(['x'])
  })

  it('scoped tenant, no manual: sees the whole tenant', () => {
    expect(narrowToTenant(ab, undefined)).toEqual(['a', 'b'])
  })

  it('manual can only narrow WITHIN the tenant, never widen', () => {
    expect(narrowToTenant(ab, ['a'])).toEqual(['a'])       // narrows
    expect(narrowToTenant(ab, ['a', 'z'])).toEqual(['a'])  // z (other tenant) dropped
    expect(narrowToTenant(ab, ['z'])).toEqual([])          // fully outside → nothing
  })

  it('fail-closed tenant sees nothing regardless of manual filter', () => {
    expect(narrowToTenant(none, undefined)).toEqual([])
    expect(narrowToTenant(none, ['a'])).toEqual([])
  })
})
