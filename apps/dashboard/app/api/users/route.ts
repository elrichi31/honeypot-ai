import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"
import { headers } from "next/headers"

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
  }>(`SELECT id, name, email, "emailVerified", role, "createdAt", "updatedAt" FROM "user" ORDER BY "createdAt" ASC`)

  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  const body = await req.json().catch(() => null)
  if (!body?.email || !body?.password || !body?.name) {
    return NextResponse.json({ error: "name, email y password son requeridos" }, { status: 400 })
  }

  const { name, email, password } = body as { name: string; email: string; password: string }
  const role = (["admin", "analyst", "viewer"].includes(body.role) ? body.role : "analyst") as string

  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 })
  }

  try {
    const created = await auth.api.signUpEmail({ body: { name, email, password } })

    if (!created?.user) {
      return NextResponse.json({ error: "No se pudo crear el usuario" }, { status: 500 })
    }

    // Set the requested role (default analyst)
    await db.query(`UPDATE "user" SET role = $1 WHERE id = $2`, [role, created.user.id])

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
    const message = err instanceof Error ? err.message : "Error al crear usuario"
    if (message.toLowerCase().includes("already") || message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("exist")) {
      return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
