import { describe, expect, it } from 'vitest'
import { detectBot } from '../src/lib/bot-detector.js'

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

  it('classifies OpenSSH + long interactive session with many commands as human', () => {
    const { actor } = detectBot({
      clientVersion: 'SSH-2.0-OpenSSH_8.9',
      hassh: null,
      durationSec: 600,
      commands: Array.from({ length: 20 }, (_, i) => `command-${i}`),
      authAttemptCount: 1,
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
