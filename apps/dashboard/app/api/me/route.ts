import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { headers } from "next/headers"
import { isGlobalRole, type Role } from "@/lib/roles"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const result = await db.query<{ role: string; clientId: string | null }>(
    `SELECT role, "clientId" FROM "user" WHERE id = $1`,
    [session.user.id],
  )
  const role = (result.rows[0]?.role ?? "viewer") as Role

  return NextResponse.json({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role,
    clientId: result.rows[0]?.clientId ?? null,
    isSuperadmin: role === "superadmin",
    isGlobal: isGlobalRole(role),
  })
}
