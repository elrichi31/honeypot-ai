import { describe, it, expect } from 'vitest'
import { parseClickHouseScope } from './clickhouse-scope.js'

describe('parseClickHouseScope', () => {
  it('no sensorIds param: global, no filter condition', () => {
    const scope = parseClickHouseScope({})
    expect(scope.all).toBe(true)
    expect(scope.condition).toBe('')
    expect(scope.params).toEqual({})
  })

  it('__none__: fail-closed, matches nothing', () => {
    const scope = parseClickHouseScope({ sensorIds: '__none__' })
    expect(scope.all).toBe(false)
    expect(scope.sensorIds).toEqual([])
    expect(scope.condition).toBe('AND false')
  })

  it('comma-separated ids: scoped, IN-list condition with matching params', () => {
    const scope = parseClickHouseScope({ sensorIds: 'a,b, c ' })
    expect(scope.all).toBe(false)
    expect(scope.sensorIds).toEqual(['a', 'b', 'c'])
    expect(scope.condition).toBe('AND sensor_id IN {sensorIds:Array(String)}')
    expect(scope.params).toEqual({ sensorIds: ['a', 'b', 'c'] })
  })

  it('cacheSuffix is stable regardless of input order', () => {
    const a = parseClickHouseScope({ sensorIds: 'b,a' })
    const b = parseClickHouseScope({ sensorIds: 'a,b' })
    expect(a.cacheSuffix).toBe(b.cacheSuffix)
  })

  it('empty/whitespace-only ids list: fail-closed, not global', () => {
    const scope = parseClickHouseScope({ sensorIds: ' , ' })
    expect(scope.all).toBe(false)
    expect(scope.sensorIds).toEqual([])
    expect(scope.condition).toBe('AND false')
  })
})
