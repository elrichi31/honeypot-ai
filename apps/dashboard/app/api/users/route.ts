import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/audit"
import { headers } from "next/headers"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const result = await db.query<{
    id: string
    name: string
    email: string
    emailVerified: boolean
    createdAt: string
    updatedAt: string
  }>(`SELECT id, name, email, "emailVerified", "createdAt", "updatedAt" FROM "user" ORDER BY "createdAt" ASC`)

  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.email || !body?.password || !body?.name) {
    return NextResponse.json({ error: "name, email y password son requeridos" }, { status: 400 })
  }

  const { name, email, password } = body as { name: string; email: string; password: string }

  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 })
  }

  try {
    const created = await auth.api.signUpEmail({
      body: { name, email, password },
    })

    if (!created?.user) {
      return NextResponse.json({ error: "No se pudo crear el usuario" }, { status: 500 })
    }

    await logAudit({
      action: "CREATE",
      resource: "USER",
      resourceId: created.user.id,
      resourceName: email,
      details: { name, email },
      request: req,
    })

    return NextResponse.json({
      id: created.user.id,
      name: created.user.name,
      email: created.user.email,
    }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al crear usuario"
    if (message.toLowerCase().includes("already") || message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("exist")) {
      return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
