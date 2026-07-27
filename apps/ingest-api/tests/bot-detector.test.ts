import { describe, expect, it } from 'vitest'
import { detectBot } from '../src/lib/bot-detector.js'

const timestamps = (gapsMs: number[]): Date[] => {
  const out = [new Date(1_700_000_000_000)]
  for (const gap of gapsMs) out.push(new Date(out[out.length - 1].getTime() + gap))
  return out
}

describe('detectBot', () => {
  it('classifies a fast session with a known bot SSH client as bot', () => {
    const { actor } = detectBot({
      clientVersion: 'SSH-2.0-Go',
      hassh: null,
      durationSec: 3,
      commands: [],
      authAttemptCount: 1,
      loginSuccess: false,
    })
    expect(actor).toBe('bot')
  })

  it('OpenSSH + many commands WITHOUT timing evidence is unknown, not human (banner is spoofable)', () => {
    const { actor } = detectBot({
      clientVersion: 'SSH-2.0-OpenSSH_8.9',
      hassh: null,
      durationSec: 600,
      commands: Array.from({ length: 20 }, (_, i) => `command-${i}`),
      authAttemptCount: 1,
      loginSuccess: true,
    })
    expect(actor).not.toBe('bot')
    expect(actor).not.toBe('human')
  })

  it('human typing pace between commands yields human', () => {
    const { actor } = detectBot({
      clientVersion: 'SSH-2.0-OpenSSH_8.9',
      hassh: null,
      durationSec: 180,
      commands: ['ls', 'cd /tmp', 'wget example.com/x', 'ls -la', 'cat readme'],
      commandTimestamps: timestamps([3000, 8000, 15000, 4000]),
      authAttemptCount: 1,
      loginSuccess: true,
    })
    expect(actor).toBe('human')
  })

  it('script-speed timing marks bot even with many commands and long duration', () => {
    const { actor } = detectBot({
      clientVersion: 'SSH-2.0-OpenSSH_8.9',
      hassh: null,
      durationSec: 120,
      commands: Array.from({ length: 20 }, (_, i) => `cmd-${i}`),
      commandTimestamps: timestamps(Array(19).fill(100)),
      authAttemptCount: 1,
      loginSuccess: true,
    })
    expect(actor).toBe('bot')
  })

  it('terminal resize mid-session is a human signal', () => {
    const { actor } = detectBot({
      clientVersion: null,
      hassh: null,
      durationSec: 90,
      commands: ['ls', 'top'],
      terminalSizeEventCount: 2,
      authAttemptCount: 1,
      loginSuccess: true,
    })
    expect(actor).toBe('human')
  })

  it('PuTTY client with slow pace and auth retries is human', () => {
    const { actor } = detectBot({
      clientVersion: 'SSH-2.0-PuTTY_Release_0.78',
      hassh: null,
      durationSec: 240,
      commands: ['ls', 'pwd', 'cat notes.txt'],
      commandTimestamps: timestamps([5000, 12000]),
      authAttemptCount: 4,
      loginSuccess: true,
    })
    expect(actor).toBe('human')
  })

  it('does not force a null-duration session toward human or bot on duration alone', () => {
    const withNullDuration = detectBot({
      clientVersion: null,
      hassh: null,
      durationSec: null,
      commands: [],
      authAttemptCount: 0,
      loginSuccess: null,
    })
    // No duration signal, no client fingerprint, no commands beyond the base
    // "no commands executed" bump — should land in the unknown/human range, not bot.
    expect(withNullDuration.actor).not.toBe('bot')
  })

  it('treats a single-shot failed auth attempt as a bot-leaning signal', () => {
    const { botScore, reasons } = detectBot({
      clientVersion: null,
      hassh: null,
      durationSec: null,
      commands: [],
      authAttemptCount: 1,
      loginSuccess: false,
    })
    expect(botScore).toBeGreaterThan(0)
    expect(reasons.some(r => r.includes('Single-shot auth attempt'))).toBe(true)
  })

  it('flags a known bot HASSH fingerprint when configured via env var', () => {
    const original = process.env.BOT_HASSH_FINGERPRINTS
    process.env.BOT_HASSH_FINGERPRINTS = 'deadbeefcafe'
    try {
      const { reasons, botScore } = detectBot({
        clientVersion: null,
        hassh: 'deadbeefcafe',
        durationSec: null,
        commands: [],
        authAttemptCount: 0,
        loginSuccess: null,
      })
      expect(botScore).toBeGreaterThan(0)
      expect(reasons.some(r => r.includes('Known bot HASSH fingerprint'))).toBe(true)
    } finally {
      process.env.BOT_HASSH_FINGERPRINTS = original
    }
  })

  it('does not flag an unconfigured HASSH fingerprint', () => {
    const original = process.env.BOT_HASSH_FINGERPRINTS
    delete process.env.BOT_HASSH_FINGERPRINTS
    try {
      const { reasons } = detectBot({
        clientVersion: null,
        hassh: 'some-random-hassh',
        durationSec: null,
        commands: [],
        authAttemptCount: 0,
        loginSuccess: null,
      })
      expect(reasons.some(r => r.includes('Known bot HASSH fingerprint'))).toBe(false)
    } finally {
      process.env.BOT_HASSH_FINGERPRINTS = original
    }
  })

  it('flags a date-pattern password as a breach-list indicator', () => {
    const { reasons } = detectBot({
      clientVersion: null,
      hassh: null,
      durationSec: null,
      commands: [],
      authAttemptCount: 1,
      loginSuccess: false,
      password: '01011990',
    })
    expect(reasons.some(r => r.includes('breach list indicator'))).toBe(true)
  })
})
