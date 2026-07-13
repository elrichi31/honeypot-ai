import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { headers } from "next/headers"
import { extractClientIp } from "@/lib/ip"
import type { PaginationMeta } from "@/lib/api"

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "DOWNLOAD" | "LOGIN" | "LOGOUT"
export type AuditResource =
  | "USER"
  | "CLIENT"
  | "SENSOR"
  | "SENSOR_CONFIG"
  | "TOKEN"
  | "MALWARE"
  | "SETTINGS"
  | "SESSION"

async function insertAuditRow(
  userId: string,
  userEmail: string,
  userName: string,
  action: AuditAction,
  resource: AuditResource,
  resourceId: string | null,
  resourceName: string | null,
  details: Record<string, unknown>,
  ipAddress: string | null,
  userAgent: string | null,
) {
  await db.query(
    `INSERT INTO audit_log
       ("id", "userId", "userEmail", "userName", "action", "resource", "resourceId", "resourceName", "details", "ipAddress", "userAgent", "createdAt")
     VALUES
       (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
    [userId, userEmail, userName, action, resource, resourceId, resourceName, JSON.stringify(details), ipAddress, userAgent],
  )
}

/** Para eventos donde ya tenemos el usuario (ej: login, logout). */
export async function logAuditDirect({
  userId,
  userEmail,
  userName,
  action,
  resource,
  resourceId,
  resourceName,
  details,
  ipAddress,
  userAgent,
}: {
  userId: string
  userEmail: string
  userName: string
  action: AuditAction
  resource: AuditResource
  resourceId?: string
  resourceName?: string
  details?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
}) {
  try {
    await insertAuditRow(
      userId,
      userEmail,
      userName,
      action,
      resource,
      resourceId ?? null,
      resourceName ?? null,
      details ?? {},
      ipAddress ?? null,
      userAgent ?? null,
    )
  } catch {
    // non-critical
  }
}

export async function logAudit({
  action,
  resource,
  resourceId,
  resourceName,
  details,
  request,
}: {
  action: AuditAction
  resource: AuditResource
  resourceId?: string
  resourceName?: string
  details?: Record<string, unknown>
  request?: Request
}) {
  try {
    const reqHeaders = request ? new Headers(request.headers) : await headers()
    const session = await auth.api.getSession({ headers: reqHeaders as Headers })
    if (!session?.user) return

    // Prefer the browser-reported public IP (x-client-public-ip); the raw
    // forwarded headers are internal (172.x) behind the tunnel/Docker.
    const ip = extractClientIp(reqHeaders as Headers)
    const userAgent = reqHeaders.get("user-agent")

    await insertAuditRow(
      session.user.id,
      session.user.email,
      session.user.name || "",
      action,
      resource,
      resourceId ?? null,
      resourceName ?? null,
      details ?? {},
      ip,
      userAgent ?? null,
    )
  } catch {
    // Audit logging is non-critical — never break the main request flow
  }
}

// ── Reader ──────────────────────────────────────────────────────────────────

export type AuditEntry = {
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
}

export type AuditLogParams = {
  page: number
  pageSize: number
  action?: string
  resource?: string
  userId?: string
}

export type AuditLogResult = {
  entries: AuditEntry[]
  pagination: PaginationMeta
}

/**
 * Reads a page of the audit log — the single source of truth for the read-side
 * `audit_log` query, called directly from the server-rendered audit page (no
 * internal HTTP hop). Callers own authorization (`requireRole`).
 */
export async function getAuditLog({
  page,
  pageSize,
  action,
  resource,
  userId,
}: AuditLogParams): Promise<AuditLogResult> {
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
  const offset = (page - 1) * pageSize

  const [rows, countResult] = await Promise.all([
    db.query<AuditEntry>(
      `SELECT id, "userId", "userEmail", "userName", action, resource, "resourceId", "resourceName", details, "ipAddress", "userAgent", "createdAt"
       FROM audit_log
       ${where}
       ORDER BY "createdAt" DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, pageSize, offset],
    ),
    db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM audit_log ${where}`, values),
  ])

  const total = parseInt(countResult.rows[0]?.count ?? "0", 10)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    entries: rows.rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  }
}
