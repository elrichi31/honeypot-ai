/**
 * Tests for session classification: stable keys, severity ranking after the
 * label→key refactor, and full dictionary coverage for every ClassificationKey.
 * Run from apps/dashboard:  npx tsx --test lib/session-classify-v2.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  classify,
  groupSessionsByIp,
  type ClassificationKey,
  type SessionItem,
} from "./session-classify-v2.ts"
import { dictionaries, LOCALES } from "./i18n/dictionaries.ts"

// Minimal session factory — only the fields classify() reads.
function session(overrides: Partial<SessionItem> = {}): SessionItem {
  return {
    id: overrides.id ?? "s1",
    srcIp: overrides.srcIp ?? "1.2.3.4",
    country: null,
    countryName: null,
    startTime: overrides.startTime ?? "2026-06-19T00:00:00Z",
    duration: overrides.duration ?? 0,
    loginSuccess: overrides.loginSuccess ?? false,
    eventCount: overrides.eventCount ?? 0,
    authAttemptCount: overrides.authAttemptCount ?? 0,
    commandCount: overrides.commandCount ?? 0,
    ...overrides,
  }
}

test("port probe: no auth, few events", () => {
  assert.equal(classify(session({ eventCount: 2 })).key, "portProbe")
})

test("burst brute-force: many auth attempts, no login", () => {
  assert.equal(classify(session({ authAttemptCount: 40 })).key, "burstBrute")
})

test("scanner: a handful of auth attempts, no login", () => {
  assert.equal(classify(session({ authAttemptCount: 4, eventCount: 5 })).key, "scanner")
})

test("malware dropper: logged in, long human session with commands", () => {
  const c = classify(
    session({ loginSuccess: true, duration: 2000, commandCount: 25, sessionType: "human" }),
  )
  assert.equal(c.key, "malwareDropper")
  assert.deepEqual(c.summaryVars, { commandCount: 25 })
})

test("login only: logged in, no post-login activity", () => {
  assert.equal(classify(session({ loginSuccess: true, commandCount: 0 })).key, "loginOnly")
})

test("threat tag wins over heuristics when logged in", () => {
  const c = classify(session({ loginSuccess: true, threatTags: ["crypto_mining"] }))
  assert.equal(c.key, "cryptoMiner")
})

test("severity ranking: worst classification wins for an IP group", () => {
  const groups = groupSessionsByIp([
    session({ id: "a", srcIp: "9.9.9.9", authAttemptCount: 4, eventCount: 5 }), // scanner
    session({
      id: "b",
      srcIp: "9.9.9.9",
      loginSuccess: true,
      duration: 2000,
      commandCount: 25,
      sessionType: "human",
    }), // malware dropper
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].worstClassification.key, "malwareDropper")
})

test("every ClassificationKey has label + summary in every locale", () => {
  const keys: ClassificationKey[] = [
    "sshBackdoor", "honeypotEvasion", "containerEscape", "cryptoMiner",
    "dataExfil", "targetedCrypto", "portProbe", "burstBrute", "slowBrute",
    "credSpray", "scanner", "malwareDropper", "interactive", "recon",
    "botScript", "loginOnly",
  ]
  for (const locale of LOCALES) {
    const dict = dictionaries[locale]
    for (const key of keys) {
      assert.ok(
        dict[`sessions.class.${key}.label`],
        `missing ${locale} label for ${key}`,
      )
      assert.ok(
        dict[`sessions.class.${key}.summary`],
        `missing ${locale} summary for ${key}`,
      )
    }
  }
})
