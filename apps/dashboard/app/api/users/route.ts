import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

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
  const role = (["superadmin", "admin", "analyst", "viewer"].includes(body.role) ? body.role : "analyst") as string
  const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  try {
    const created = await auth.api.signUpEmail({ body: { name, email, password } })

    if (!created?.user) {
      return NextResponse.json({ error: "Could not create user" }, { status: 500 })
    }

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
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
