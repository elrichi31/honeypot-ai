import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { headers } from "next/headers"

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "DOWNLOAD" | "LOGIN" | "LOGOUT"
export type AuditResource =
  | "USER"
  | "CLIENT"
  | "SENSOR"
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

    const forwardedFor = request
      ? request.headers.get("x-forwarded-for")
      : (await headers()).get("x-forwarded-for")
    const realIp = request
      ? request.headers.get("x-real-ip")
      : (await headers()).get("x-real-ip")
    const userAgent = request
      ? request.headers.get("user-agent")
      : (await headers()).get("user-agent")

    const ip = forwardedFor?.split(",")[0]?.trim() ?? realIp ?? null

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
