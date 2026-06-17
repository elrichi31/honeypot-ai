import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/audit"
import { requireRole } from "@/lib/roles"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  const { id } = await params

  if (id === auth_check.userId) {
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
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  const { id } = await params
  const body = await req.json().catch(() => null)

  // clientId can be set to a string (assign tenant) or null (unassign). Use a
  // presence check so `clientId: null` is treated as an intentional update.
  const hasClientId = body && Object.prototype.hasOwnProperty.call(body, "clientId")

  if (!body?.name && !body?.role && !hasClientId) {
    return NextResponse.json({ error: "Se requiere name, role o clientId" }, { status: 400 })
  }

  if (body?.role && !["superadmin", "admin", "analyst", "viewer"].includes(body.role)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 })
  }

  // Prevent removing admin-level access from own account
  if (body?.role && id === auth_check.userId && !["admin", "superadmin"].includes(body.role)) {
    return NextResponse.json({ error: "No puedes quitarte el rol de admin a ti mismo" }, { status: 400 })
  }

  const current = await db.query<{ id: string; name: string; email: string; role: string; clientId: string | null }>(
    `SELECT id, name, email, role, "clientId" FROM "user" WHERE id = $1 LIMIT 1`,
    [id],
  )

  if (!current.rows[0]) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
  }

  const target = current.rows[0]
  const newName = body.name ?? target.name
  const newRole = body.role ?? target.role
  const newClientId = hasClientId ? (body.clientId || null) : target.clientId

  const result = await db.query<{ id: string; name: string; email: string; role: string; clientId: string | null }>(
    `UPDATE "user" SET name = $1, role = $2, "clientId" = $3, "updatedAt" = now() WHERE id = $4
     RETURNING id, name, email, role, "clientId"`,
    [newName, newRole, newClientId, id],
  )

  await logAudit({
    action: "UPDATE",
    resource: "USER",
    resourceId: id,
    resourceName: target.email,
    details: {
      ...(body.name ? { name: newName } : {}),
      ...(body.role ? { rolePrev: target.role, roleNew: newRole } : {}),
      ...(hasClientId ? { clientIdPrev: target.clientId, clientIdNew: newClientId } : {}),
    },
    request: req,
  })

  return NextResponse.json(result.rows[0])
}
