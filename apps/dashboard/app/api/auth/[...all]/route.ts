import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"
import type { NextRequest } from "next/server"
import { logAuditDirect } from "@/lib/audit"
import { lookupIpFull } from "@/lib/geo"
import { db } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const { GET, POST: authPost } = toNextJsHandler(auth)
export { GET }

function extractIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  )
}

export async function POST(req: NextRequest, ctx: unknown) {
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

  const response = await authPost(req, ctx as never)

  // Log LOGIN
  if (isSignIn && response.ok) {
    try {
      const reqBody = await cloned!.json().catch(() => ({}))
      const resBody = await response.clone().json().catch(() => null)
      const geo = ip ? lookupIpFull(ip) : null

      await logAuditDirect({
        userId: resBody?.user?.id ?? "unknown",
        userEmail: reqBody?.email ?? resBody?.user?.email ?? "unknown",
        userName: resBody?.user?.name ?? "",
        action: "LOGIN",
        resource: "USER",
        resourceName: geo?.countryName ?? null,
        details: {
          country: geo?.country ?? null,
          countryName: geo?.countryName ?? null,
          city: geo?.city ?? null,
          region: geo?.region ?? null,
          timezone: geo?.timezone ?? null,
        },
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
      const geo = ip ? lookupIpFull(ip) : null

      await logAuditDirect({
        userId: logoutUser.id,
        userEmail: logoutUser.email,
        userName: logoutUser.name,
        action: "LOGOUT",
        resource: "USER",
        resourceName: geo?.countryName ?? null,
        details: {
          country: geo?.country ?? null,
          countryName: geo?.countryName ?? null,
          city: geo?.city ?? null,
        },
        ipAddress: ip,
        userAgent,
      })
    } catch { /* non-critical */ }
  }

  return response
}
