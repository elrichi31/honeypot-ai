import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { headers } from "next/headers"
import type { Role } from "@/lib/roles"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const result = await db.query<{ role: string }>(
    `SELECT role FROM "user" WHERE id = $1`,
    [session.user.id],
  )

  return NextResponse.json({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: (result.rows[0]?.role ?? "viewer") as Role,
  })
}
