import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"
import type { NextRequest } from "next/server"
import { logAuditDirect } from "@/lib/audit"
import { lookupIpFull } from "@/lib/geo"
import { enrichIp } from "@/lib/ip-enrichment"
import { db } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const { GET, POST: authPost } = toNextJsHandler(auth)
export { GET }

const PRIVATE_IP_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80:|169\.254\.)/i

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_RE.test(ip)
}

/**
 * IP del cliente. Como el login llega por túnel SSH / proxy, los headers HTTP
 * suelen traer loopback; por eso priorizamos la IP pública que reporta el
 * navegador (x-client-public-ip) y caemos a los headers estándar si no viene.
 */
function extractIp(req: NextRequest): string | null {
  const clientReported = req.headers.get("x-client-public-ip")?.trim()
  if (clientReported && !isPrivateIp(clientReported)) return clientReported

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwarded) return forwarded

  return req.headers.get("x-real-ip") ?? clientReported ?? null
}

/**
 * Construye los `details` de auditoría para login/logout. Si la IP es pública
 * la enriquecemos con AbuseIPDB + ipinfo (país, ASN, ISP, score de abuso);
 * si no, caemos a geoip-lite local. Best-effort: nunca lanza.
 */
async function buildGeoDetails(ip: string | null): Promise<{
  resourceName: string | undefined
  details: Record<string, unknown>
}> {
  if (!ip) return { resourceName: undefined, details: {} }

  if (!isPrivateIp(ip)) {
    try {
      const e = await enrichIp(ip)
      const country =
        e.abuseipdb?.countryCode || e.ipinfo?.country || null
      const countryName = e.abuseipdb?.countryName || null
      const asn = e.ipinfo?.asn || null
      const org = e.ipinfo?.org || e.abuseipdb?.isp || null
      const city = e.ipinfo?.city || null
      if (country || asn || org || city) {
        return {
          resourceName: countryName ?? country ?? undefined,
          details: {
            country,
            countryName,
            city,
            region: e.ipinfo?.region || null,
            timezone: e.ipinfo?.timezone || null,
            asn,
            org,
            isp: e.abuseipdb?.isp || null,
            usageType: e.abuseipdb?.usageType || null,
            abuseConfidenceScore: e.abuseipdb?.abuseConfidenceScore ?? null,
            totalReports: e.abuseipdb?.totalReports ?? null,
            isVpn: e.ipinfo?.isVpn ?? e.abuseipdb?.isVpn ?? null,
            isTor: e.ipinfo?.isTor ?? e.abuseipdb?.isTor ?? null,
            isHosting: e.ipinfo?.isHosting ?? null,
          },
        }
      }
    } catch { /* fall through to local geoip */ }
  }

  // Fallback local (IPs privadas o si el enriquecimiento externo falla)
  const geo = lookupIpFull(ip)
  return {
    resourceName: geo?.countryName ?? undefined,
    details: {
      country: geo?.country ?? null,
      countryName: geo?.countryName ?? null,
      city: geo?.city ?? null,
      region: geo?.region ?? null,
      timezone: geo?.timezone ?? null,
    },
  }
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const path = url.pathname
  const isSignIn = path.endsWith("/sign-in/email")
  const isSignOut = path.endsWith("/sign-out")
  const isSignUp = path.endsWith("/sign-up/email")

  const ip = extractIp(req)
  const userAgent = req.headers.get("user-agent") ?? null

  // For logout: capture who's logged in BEFORE the session is destroyed
  let logoutUser: { id: string; email: string; name: string } | null = null
  if (isSignOut) {
    try {
      const session = await auth.api.getSession({ headers: req.headers })
      if (session?.user) {
        logoutUser = { id: session.user.id, email: session.user.email, name: session.user.name || "" }
      }
    } catch { /* non-critical */ }
  }

  // For login/signup: clone request body before the handler consumes it
  const cloned = (isSignIn || isSignUp) ? req.clone() : null

  const response = await authPost(req)

  // Log LOGIN
  if (isSignIn && response.ok) {
    try {
      const reqBody = await cloned!.json().catch(() => ({}))
      const resBody = await response.clone().json().catch(() => null)
      const { resourceName, details } = await buildGeoDetails(ip)

      await logAuditDirect({
        userId: resBody?.user?.id ?? "unknown",
        userEmail: reqBody?.email ?? resBody?.user?.email ?? "unknown",
        userName: resBody?.user?.name ?? "",
        action: "LOGIN",
        resource: "USER",
        resourceName,
        details,
        ipAddress: ip,
        userAgent,
      })
    } catch { /* non-critical */ }
  }

  // Auto-promote first user (setup page) to admin
  if (isSignUp && response.ok) {
    try {
      const resBody = await response.clone().json().catch(() => null)
      const userId = resBody?.user?.id
      if (userId) {
        // If no admin exists yet, this is the first user — promote them
        const { rows } = await db.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM "user" WHERE role = 'admin'`
        )
        if (rows[0]?.count === "0") {
          await db.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [userId])
        }
      }
    } catch { /* non-critical */ }
  }

  // Log LOGOUT
  if (isSignOut && logoutUser) {
    try {
      const { resourceName, details } = await buildGeoDetails(ip)

      await logAuditDirect({
        userId: logoutUser.id,
        userEmail: logoutUser.email,
        userName: logoutUser.name,
        action: "LOGOUT",
        resource: "USER",
        resourceName,
        details,
        ipAddress: ip,
        userAgent,
      })
    } catch { /* non-critical */ }
  }

  return response
}
