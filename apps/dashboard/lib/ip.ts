// Shared client-IP extraction for audit/auth. The dashboard sits behind an SSH
// tunnel / Docker, so server-seen headers (x-forwarded-for, x-real-ip) carry an
// internal address (e.g. 172.21.0.1 / 127.0.0.1). The browser reports its real
// public IP in the `x-client-public-ip` header, which we prefer when it's public.

const PRIVATE_IP_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80:|169\.254\.)/i

export function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_RE.test(ip)
}

/**
 * Best client IP from a set of request headers. Prefers the browser-reported
 * public IP, then x-forwarded-for, then x-real-ip. Accepts a Headers object so
 * it works with both NextRequest.headers and next/headers().
 */
export function extractClientIp(headers: Headers): string | null {
  const clientReported = headers.get("x-client-public-ip")?.trim()
  if (clientReported && !isPrivateIp(clientReported)) return clientReported

  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwarded) return forwarded

  return headers.get("x-real-ip")?.trim() ?? clientReported ?? null
}
