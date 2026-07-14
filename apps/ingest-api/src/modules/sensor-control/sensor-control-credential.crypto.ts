import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

export function generateControlSecret(): string {
  return randomBytes(32).toString('hex')
}

export function secretPrefix(secret: string): string {
  return secret.slice(0, 8)
}

export function hashSecret(secret: string, pepper: string): string {
  return createHmac('sha256', pepper).update(secret).digest('hex')
}

export function verifySecret(secret: string, hash: string, pepper: string): boolean {
  if (!secret || !hash) return false
  const provided = Buffer.from(hashSecret(secret, pepper))
  const expected = Buffer.from(hash)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}
