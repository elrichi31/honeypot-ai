import { describe, expect, it } from 'vitest'
import { generateControlSecret, hashSecret, secretPrefix, verifySecret } from '../src/modules/sensor-control/sensor-control-credential.crypto.js'

describe('sensor control credential crypto', () => {
  it('generates high-entropy hex secrets', () => {
    const a = generateControlSecret()
    const b = generateControlSecret()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  it('derives a stable prefix from the raw secret', () => {
    const secret = generateControlSecret()
    expect(secretPrefix(secret)).toBe(secret.slice(0, 8))
    expect(secretPrefix(secret)).toHaveLength(8)
  })

  it('hashes deterministically for the same secret and pepper', () => {
    const secret = generateControlSecret()
    expect(hashSecret(secret, 'pepper-a')).toBe(hashSecret(secret, 'pepper-a'))
  })

  it('never stores the raw secret as the hash', () => {
    const secret = generateControlSecret()
    expect(hashSecret(secret, 'pepper-a')).not.toBe(secret)
  })

  it('produces a different hash for a different pepper', () => {
    const secret = generateControlSecret()
    expect(hashSecret(secret, 'pepper-a')).not.toBe(hashSecret(secret, 'pepper-b'))
  })

  it('verifies the correct secret/pepper pair', () => {
    const secret = generateControlSecret()
    const hash = hashSecret(secret, 'pepper-a')
    expect(verifySecret(secret, hash, 'pepper-a')).toBe(true)
  })

  it('rejects the wrong secret', () => {
    const hash = hashSecret(generateControlSecret(), 'pepper-a')
    expect(verifySecret(generateControlSecret(), hash, 'pepper-a')).toBe(false)
  })

  it('rejects the wrong pepper', () => {
    const secret = generateControlSecret()
    const hash = hashSecret(secret, 'pepper-a')
    expect(verifySecret(secret, hash, 'pepper-b')).toBe(false)
  })

  it('rejects empty or malformed input without throwing', () => {
    expect(verifySecret('', 'somehash', 'pepper-a')).toBe(false)
    expect(verifySecret('somesecret', '', 'pepper-a')).toBe(false)
    expect(verifySecret('', '', 'pepper-a')).toBe(false)
  })
})
