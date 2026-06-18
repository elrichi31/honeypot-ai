import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

// Revoke a single dashboard session immediately by deleting its row. Admin-only.
// Note: a 5-minute cookieCache (lib/auth.ts) means the revoked session may still
// validate for up to ~5 min before the user is forced out.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  const { id } = await params

  const existing = await db.query<{ id: string; userId: string; email: string }>(
    `SELECT s.id, s."userId", u.email
       FROM "session" s JOIN "user" u ON u.id = s."userId"
      WHERE s.id = $1 LIMIT 1`,
    [id],
  )
  if (!existing.rows[0]) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  await db.query(`DELETE FROM "session" WHERE id = $1`, [id])

  await logAudit({
    action: "DELETE",
    resource: "SESSION",
    resourceId: id,
    resourceName: existing.rows[0].email,
    details: { revokedUserId: existing.rows[0].userId },
    request: req,
  })

  return new NextResponse(null, { status: 204 })
}
