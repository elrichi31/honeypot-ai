import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

// Revoke ALL active sessions for a given user (force logout everywhere). Admin-only.
export async function POST(req: NextRequest) {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  const body = await req.json().catch(() => ({}))
  const userId = typeof body?.userId === "string" ? body.userId : ""
  if (!userId) {
    return NextResponse.json({ error: "userId requerido" }, { status: 400 })
  }

  const user = await db.query<{ email: string }>(
    `SELECT email FROM "user" WHERE id = $1 LIMIT 1`,
    [userId],
  )
  if (!user.rows[0]) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
  }

  const { rowCount } = await db.query(
    `DELETE FROM "session" WHERE "userId" = $1`,
    [userId],
  )

  await logAudit({
    action: "DELETE",
    resource: "SESSION",
    resourceId: userId,
    resourceName: user.rows[0].email,
    details: { revokedAll: true, count: rowCount ?? 0 },
    request: req,
  })

  return NextResponse.json({ ok: true, revoked: rowCount ?? 0 })
}
