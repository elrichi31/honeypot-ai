import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { headers } from "next/headers"

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)))
  const offset = (page - 1) * limit
  const action = searchParams.get("action") ?? ""
  const resource = searchParams.get("resource") ?? ""
  const userId = searchParams.get("userId") ?? ""

  const conditions: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (action) {
    conditions.push(`action = $${idx++}`)
    values.push(action.toUpperCase())
  }
  if (resource) {
    conditions.push(`resource = $${idx++}`)
    values.push(resource.toUpperCase())
  }
  if (userId) {
    conditions.push(`"userId" = $${idx++}`)
    values.push(userId)
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""

  const [rows, countResult] = await Promise.all([
    db.query<{
      id: string
      userId: string
      userEmail: string
      userName: string
      action: string
      resource: string
      resourceId: string | null
      resourceName: string | null
      details: Record<string, unknown>
      ipAddress: string | null
      userAgent: string | null
      createdAt: string
    }>(
      `SELECT id, "userId", "userEmail", "userName", action, resource, "resourceId", "resourceName", details, "ipAddress", "userAgent", "createdAt"
       FROM audit_log
       ${where}
       ORDER BY "createdAt" DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    ),
    db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM audit_log ${where}`, values),
  ])

  const total = parseInt(countResult.rows[0]?.count ?? "0", 10)

  return NextResponse.json({
    entries: rows.rows,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  })
}
