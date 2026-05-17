import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/audit"
import { headers } from "next/headers"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  if (id === session.user.id) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 })
  }

  const existing = await db.query<{ id: string; email: string; name: string }>(
    `SELECT id, email, name FROM "user" WHERE id = $1 LIMIT 1`,
    [id],
  )

  if (!existing.rows[0]) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
  }

  const target = existing.rows[0]

  await db.query(`DELETE FROM "user" WHERE id = $1`, [id])

  await logAudit({
    action: "DELETE",
    resource: "USER",
    resourceId: id,
    resourceName: target.email,
    details: { name: target.name, email: target.email },
    request: req,
  })

  return new NextResponse(null, { status: 204 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)

  if (!body?.name) {
    return NextResponse.json({ error: "name es requerido" }, { status: 400 })
  }

  const result = await db.query<{ id: string; name: string; email: string }>(
    `UPDATE "user" SET name = $1, "updatedAt" = now() WHERE id = $2 RETURNING id, name, email`,
    [body.name, id],
  )

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
  }

  await logAudit({
    action: "UPDATE",
    resource: "USER",
    resourceId: id,
    resourceName: result.rows[0].email,
    details: { name: body.name },
    request: req,
  })

  return NextResponse.json(result.rows[0])
}
