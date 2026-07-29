import { describe, expect, it } from 'vitest'
import { buildKillchains, buildNetworkSummaries } from '../src/modules/deception/deception.service.js'
import type {
  DeceptionNetworkMetrics,
  KillChainStepRow,
} from '../src/modules/deception/deception.repository.js'

function row(overrides: Partial<KillChainStepRow>): KillChainStepRow {
  return {
    node_id: 'node-1', node_name: 'mysql-trap', protocol: 'mysql', dst_port: 3306,
    event_type: 'connection', username: null, password: null,
    timestamp: new Date('2026-07-05T10:00:00Z'),
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

  it('uses the event internal source dynamically instead of a fixed attacker IP', () => {
    const [chain] = buildKillchains([row({
      session_id: null,
      src_ip: '192.168.100.129',
    })])
    expect(chain.correlation).toBe('none')
    expect(chain.key).toBe('internal:192.168.100.129')
    expect(chain.sourceIp).toBe('192.168.100.129')
    expect(chain.sessionId).toBeNull()
  })

  it('keeps different internal attackers in separate chains', () => {
    const chains = buildKillchains([
      row({ session_id: null, src_ip: '192.168.100.129' }),
      row({ session_id: null, src_ip: '192.168.100.130' }),
    ])
    expect(chains.map(chain => chain.sourceIp).sort()).toEqual([
      '192.168.100.129',
      '192.168.100.130',
    ])
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

describe('buildNetworkSummaries', () => {
  it('assigns statuses and sorts breached, active, then quiet', () => {
    const network = (
      clientId: string,
      hits24h: number,
      distinctNodes24h: number,
      lastEvent: Date | null,
    ): DeceptionNetworkMetrics => ({
      clientId,
      clientSlug: clientId,
      clientName: clientId,
      nodesTotal: 2,
      nodesOnline: 2,
      hits24h,
      hits7d: hits24h,
      authAttempts24h: 0,
      uniqueSrcIps24h: 0,
      activeChains24h: 0,
      distinctNodes24h,
      lastEvent,
    })

    const summaries = buildNetworkSummaries([
      network('quiet', 0, 0, null),
      network('active-older', 3, 1, new Date('2026-07-28T10:00:00Z')),
      network('active-newer', 1, 1, new Date('2026-07-28T11:00:00Z')),
      network('breached', 4, 2, new Date('2026-07-28T09:00:00Z')),
    ])

    expect(summaries.map(({ clientId, status }) => ({ clientId, status }))).toEqual([
      { clientId: 'breached', status: 'breached' },
      { clientId: 'active-newer', status: 'active' },
      { clientId: 'active-older', status: 'active' },
      { clientId: 'quiet', status: 'quiet' },
    ])
    expect(summaries.every(summary => !('distinctNodes24h' in summary))).toBe(true)
  })
})
