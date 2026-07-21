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
  const clientId = result.rows[0]?.clientId ?? null

  // For a `cliente`, the sidebar only shows the honeypot module groups the client
  // actually has sensors for. Staff (global) see everything → modules stays null.
  let modules: { ssh: boolean; web: boolean; network: boolean } | null = null
  if (role === "cliente" && clientId) {
    const sensors = await db.query<{ protocol: string }>(
      `SELECT DISTINCT protocol FROM sensors WHERE client_id = $1`,
      [clientId],
    )
    const p = new Set(sensors.rows.map((r) => r.protocol))
    modules = {
      ssh: p.has("ssh"),
      web: p.has("http"),
      // any non-ssh/http honeypot (dionaea/mysql/port-scan/smb/deception/…)
      network: [...p].some((x) => x !== "ssh" && x !== "http"),
    }
  }

  return NextResponse.json({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role,
    clientId,
    isSuperadmin: role === "superadmin",
    isGlobal: isGlobalRole(role),
    modules,
  })
}
