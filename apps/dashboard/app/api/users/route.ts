import { NextRequest, NextResponse } from "next/server"
import { authAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/audit"
import { requireRole, ALL_ROLES, isGlobalRole, type Role } from "@/lib/roles"
import { logAndRespond } from "@/lib/api-error"

export async function GET() {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  const result = await db.query<{
    id: string
    name: string
    email: string
    emailVerified: boolean
    role: string
    createdAt: string
    updatedAt: string
    clientId: string | null
  }>(`SELECT id, name, email, "emailVerified", role, "clientId", "createdAt", "updatedAt" FROM "user" ORDER BY "createdAt" ASC`)

  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  const body = await req.json().catch(() => null)
  if (!body?.email || !body?.password || !body?.name) {
    return NextResponse.json({ error: "name, email and password are required" }, { status: 400 })
  }

  const { name, email, password } = body as { name: string; email: string; password: string }
  const role = ((ALL_ROLES as string[]).includes(body.role) ? body.role : "analyst") as Role
  // Only `cliente` carries a tenant; staff roles are global (clientId stays null).
  const clientId = isGlobalRole(role) ? null : (typeof body.clientId === "string" && body.clientId ? body.clientId : null)

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  try {
    // authAdmin (no nextCookies) so this never overwrites the caller's session.
    const created = await authAdmin.api.signUpEmail({ body: { name, email, password } })

    if (!created?.user) {
      return NextResponse.json({ error: "Could not create user" }, { status: 500 })
    }

    // signUpEmail also opens a session for the new user; it was never delivered
    // to any browser, so drop it — the new user logs in fresh.
    await db.query(`DELETE FROM "session" WHERE "userId" = $1`, [created.user.id])

    // Set the requested role (default analyst) and tenant scope.
    await db.query(`UPDATE "user" SET role = $1, "clientId" = $2 WHERE id = $3`, [role, clientId, created.user.id])

    await logAudit({
      action: "CREATE",
      resource: "USER",
      resourceId: created.user.id,
      resourceName: email,
      details: { name, email, role },
      request: req,
    })

    return NextResponse.json({
      id: created.user.id,
      name: created.user.name,
      email: created.user.email,
      role,
    }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error creating user"
    if (message.toLowerCase().includes("already") || message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("exist")) {
      return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 })
    }
    return logAndRespond(err, { route: "/api/users", email, role })
  }
}
