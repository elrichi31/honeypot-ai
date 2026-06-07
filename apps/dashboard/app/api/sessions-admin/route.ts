import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

// List active dashboard login sessions (better-auth `session` table), joined to
// the user. Admin-only. Used by the /sessions-admin page to revoke sessions.
export async function GET() {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  const { rows } = await db.query<{
    id: string
    userId: string
    email: string
    name: string
    ipAddress: string | null
    userAgent: string | null
    createdAt: string
    expiresAt: string
  }>(
    `SELECT s.id, s."userId", u.email, u.name,
            s."ipAddress", s."userAgent", s."createdAt", s."expiresAt"
       FROM "session" s
       JOIN "user" u ON u.id = s."userId"
      WHERE s."expiresAt" > now()
      ORDER BY s."createdAt" DESC`,
  )

  return NextResponse.json({
    sessions: rows,
    currentSessionUserId: auth_check.userId,
  })
}
