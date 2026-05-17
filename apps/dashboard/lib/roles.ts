import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export type Role = "admin" | "analyst" | "viewer"

const ROLE_ORDER: Role[] = ["viewer", "analyst", "admin"]

export function hasPermission(userRole: Role, requiredRole: Role): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(requiredRole)
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Acceso total incluyendo usuarios y configuración",
  analyst: "Gestión de infraestructura y análisis de datos",
  viewer: "Solo lectura del dashboard",
}

export const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-rose-500/10 text-rose-400",
  analyst: "bg-cyan-500/10 text-cyan-400",
  viewer: "bg-slate-500/10 text-slate-400",
}

export type AuthOk = {
  ok: true
  userId: string
  userEmail: string
  userName: string
  role: Role
}
export type AuthFail = { ok: false; response: NextResponse }
export type AuthResult = AuthOk | AuthFail

/**
 * Verifies the current session and checks that the user has at least `minRole`.
 * Returns user info on success or a ready-to-return error response on failure.
 */
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
