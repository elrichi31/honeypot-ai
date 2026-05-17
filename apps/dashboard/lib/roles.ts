import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { hasPermission, type Role } from "@/lib/roles-shared"

export type { Role } from "@/lib/roles-shared"
export { ROLE_ORDER, hasPermission, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_COLORS } from "@/lib/roles-shared"

export type AuthOk = {
  ok: true
  userId: string
  userEmail: string
  userName: string
  role: Role
}
export type AuthFail = { ok: false; response: NextResponse }
export type AuthResult = AuthOk | AuthFail

export async function requireRole(minRole: Role): Promise<AuthResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
      return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }
    }

    const result = await db.query<{ role: string }>(
      `SELECT role FROM "user" WHERE id = $1`,
      [session.user.id],
    )
    const role = (result.rows[0]?.role ?? "viewer") as Role

    if (!hasPermission(role, minRole)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: `Acceso denegado. Se requiere rol: ${minRole}` },
          { status: 403 },
        ),
      }
    }

    return {
      ok: true,
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.name || "",
      role,
    }
  } catch {
    return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }
  }
}
