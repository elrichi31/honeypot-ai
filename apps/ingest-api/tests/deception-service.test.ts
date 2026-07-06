import { describe, expect, it } from 'vitest'
import { buildKillchains } from '../src/modules/deception/deception.service.js'
import type { KillChainStepRow } from '../src/modules/deception/deception.repository.js'

function row(overrides: Partial<KillChainStepRow>): KillChainStepRow {
  return {
    node_id: 'node-1', node_name: 'mysql-trap', protocol: 'mysql', dst_port: 3306,
    event_type: 'connection', username: null, password: null,
    timestamp: new Date('2026-07-05T10:00:00Z'), public_ip: '203.0.113.5',
    session_id: 'sess-1', src_ip: '10.0.0.5', logdata: null,
    client_id: 'client-1', client_slug: 'acme', client_name: 'Acme Corp',
    ...overrides,
  }
}

describe('buildKillchains', () => {
  it('carries client attribution through to each step', () => {
    const [chain] = buildKillchains([row({})])
    expect(chain.steps[0]).toMatchObject({
      clientId: 'client-1', clientSlug: 'acme', clientName: 'Acme Corp',
    })
  })

  it('groups steps by session_id and marks the correlation as probable', () => {
    const chains = buildKillchains([
      row({ session_id: 'sess-1', timestamp: new Date('2026-07-05T10:00:00Z') }),
      row({ session_id: 'sess-1', timestamp: new Date('2026-07-05T10:01:00Z'), node_id: 'node-2' }),
    ])
    expect(chains).toHaveLength(1)
    expect(chains[0].correlation).toBe('probable')
    expect(chains[0].steps).toHaveLength(2)
    expect(chains[0].nodesTouched).toBe(2)
  })

  it('falls back to an internal:<ip> key with correlation none when session_id is null', () => {
    const [chain] = buildKillchains([row({ session_id: null })])
    expect(chain.correlation).toBe('none')
    expect(chain.key).toBe('internal:10.0.0.5')
  })

  it('keeps client attribution independent per step within the same chain', () => {
    // Rows arrive DESC (matches the repository's ORDER BY timestamp DESC) —
    // buildKillchains reverses them internally to reconstruct chronological order.
    const [chain] = buildKillchains([
      row({ session_id: 'sess-2', timestamp: new Date('2026-07-05T10:01:00Z'), node_id: 'node-2', client_id: 'client-2', client_slug: 'globex', client_name: 'Globex' }),
      row({ session_id: 'sess-2', timestamp: new Date('2026-07-05T10:00:00Z'), client_id: 'client-1', client_slug: 'acme', client_name: 'Acme Corp' }),
    ])
    expect(chain.steps.map(s => s.clientSlug)).toEqual(['acme', 'globex'])
  })

  it('sorts chains by lastSeen descending', () => {
    const chains = buildKillchains([
      row({ session_id: 'older', timestamp: new Date('2026-07-05T09:00:00Z') }),
      row({ session_id: 'newer', timestamp: new Date('2026-07-05T11:00:00Z') }),
    ])
    expect(chains.map(c => c.key)).toEqual(['newer', 'older'])
  })
})
